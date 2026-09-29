import { AIR } from '../gas'
import {
	assertGas,
	assertNonNegative,
	assertPositive,
} from '../internal/validate'
import { ATM_BAR } from '../pressure'
import { mixZ } from '../real-gas'
import type { Gas } from '../types'

const ATM = ATM_BAR

/** Why a booster fill cannot reach its target. */
export type BoosterInfeasibleReason = 'exceeds-stall' | 'supply-insufficient'

/** Inputs describing a booster fill. */
export interface BoosterInput {
	ratio: number
	// Max drive pressure the regulator can supply (bar gauge). Sets the stall
	// ceiling: max output = ratio × this. The drive pressure actually used ramps
	// up to only what's needed (≈ receiver pressure ÷ ratio), so this is a cap,
	// not the operating pressure.
	driveP: number
	supplyVol: number
	supplyStart: number
	receiverVol: number
	receiverStart: number
	target: number
	// Two-stage: source gas is regulated down to this inlet pressure (bar gauge)
	// before the boost stage.
	regulatedInletBar?: number
	/** Boosted gas for real-gas accounting. Default {@link AIR}. */
	gas?: Gas
	useRealGas?: boolean
}

// Compressibility factor at an absolute pressure for the boosted gas (1 = ideal).
function zOf(input: BoosterInput, absBar: number): number {
	return input.useRealGas ? mixZ(input.gas ?? AIR, absBar) : 1
}

/** Outcome of a booster fill calculation. */
export interface BoosterResult {
	maxOutput: number
	eqPressure: number
	processGasL: number
	driveAirL: number
	finalSupply: number
	feasible: boolean
	reason?: BoosterInfeasibleReason
	supplyLimitedMax?: number
	// Drive pressure actually needed, bar gauge: ramps from driveStart (at the
	// boost start) to driveEnd (at the target) ≈ receiver pressure ÷ ratio.
	driveStart: number
	driveEnd: number
}

/** One sample along a booster fill profile. */
export interface ProfilePoint {
	receiverP: number
	cumulativeDriveL: number
	supplyP: number
	timeSeconds?: number
	// Drive pressure being used at this point (bar gauge) ≈ receiverP / ratio.
	drivePBar?: number
	cycleRatePerSec?: number
	// Drive-gas storage (buffer) pressure as a fraction of cut-out (1 = full).
	driveBufferFrac?: number
	// Net rate the storage tank is being drawn down (free L/min).
	storageDrawLpm?: number
}

/** Timing and compressor-duty results for a booster fill. */
export interface BoosterTiming {
	fillSeconds: number // total: equalization transfer + boosting
	eqSeconds: number // free-equalization transfer portion (rate-limited)
	boostSeconds: number // active boosting portion
	// True when the booster's own max throughput is below the requested fill rate,
	// so it (not the O2 rate limit) sets the fill time.
	boosterLimited: boolean
	driveAirRateLpm: number // average drive-air consumption while boosting
	cycleRatePerSec: number // operating cycle rate (≈ constant)
	driveStartBar: number
	driveEndBar: number
	dutyCycle: number // compressor on-fraction (0 if no compressor)
	dutyContinuous: boolean // compressor runs ~100% (can't keep up)
	// Storage drained to the drive pressure before the fill finished → the
	// booster stalls and waits on the compressor. null when it doesn't happen.
	stallSeconds: number | null
}

/** Inputs for placing a booster fill on the clock. */
export interface TimingArgs {
	driveAirL: number
	riseBar: number // receiver pressure rise over the boost phase
	// Receiver rise covered by free equalization before boosting (0 if none). The
	// transfer is still rate-limited, so it counts toward the fill time.
	eqRiseBar?: number
	receiverVolL: number
	maxFillRateBarPerMin: number // O2 fill-rate limit
	driveSweptL: number // air-drive piston swept volume per cycle (geometric)
	maxCpm: number // booster max cycle rate
	ratio: number
	supplyAbsBar: number // representative supply (inlet) pressure, absolute
	driveStartBar: number
	driveEndBar: number
	compressorRateLpm: number
	storageL?: number
	storageMaxBar?: number
	storageMinBar?: number
	// Real-gas: gas moles per cycle ∝ 1/Z at the supply pressure.
	/** Boosted gas for real-gas accounting. Default {@link AIR}. */
	gas?: Gas
	useRealGas?: boolean
}

// Shared setup: the boost phase's starting conditions, after any free
// equalization (which happens only when the supply starts above the receiver).
// Real gas: moles ∝ V·P/Z, so the equalized pressure is the V/Z-weighted mean
// (first-order, Z at each side's pressure) — reduces to the ideal mean when Z=1.
function boostSetup(input: BoosterInput) {
	const { supplyVol: vs, supplyStart, receiverVol: vr, receiverStart } = input
	const supplyAbs = supplyStart + ATM
	const receiverAbs = receiverStart + ATM
	const ws = vs / zOf(input, supplyAbs)
	const wr = vr / zOf(input, receiverAbs)
	const eqAbs = (supplyAbs * ws + receiverAbs * wr) / (ws + wr)
	const eqPressure = eqAbs - ATM
	const equalizes = supplyStart > receiverStart
	const boostStartReceiver = equalizes ? eqPressure : receiverStart
	const inletStartAbs = equalizes ? eqAbs : supplyAbs
	return { eqPressure, boostStartReceiver, inletStartAbs }
}

// Drive air (free L) to move gas into the receiver. Per unit of gas delivered the
// drive air is receiverAbs / inletAbs: the air-drive piston runs at only the
// pressure needed to overcome the current back-pressure (driveP ≈ receiverP /
// ratio), so the geometric ratio cancels. The inlet (gas-piston intake) pressure
// is the supply, depleting as q is drawn, capped at capAbs for a two-stage
// regulated inlet. Real gas adds a Z(inlet)/Z(receiver) factor per the moles
// actually moved. Integrated numerically (the integrand is smooth).
function driveAirForQ(
	input: BoosterInput,
	q: number,
	boostStartAbs: number,
	inletStartAbs: number,
	capAbs: number,
	vs: number,
	vr: number,
	steps = 400,
): number {
	if (q <= 0) return 0
	const integrand = (x: number) => {
		const receiverAbs = boostStartAbs + x / vr
		const inletAbs = Math.min(inletStartAbs - x / vs, capAbs)
		const zFactor = zOf(input, inletAbs) / zOf(input, receiverAbs)
		return (receiverAbs / inletAbs) * zFactor
	}
	const h = q / steps
	let sum = 0.5 * (integrand(0) + integrand(q))
	for (let i = 1; i < steps; i++) sum += integrand(i * h)
	return sum * h
}

/**
 * Model a gas booster fill: free equalisation, then boosting to `target`.
 * @example booster({ ratio: 40, driveP: 8, supplyVol: 50, supplyStart: 150, receiverVol: 11.1, receiverStart: 0, target: 200 }).feasible // true
 */
export function booster(input: BoosterInput): BoosterResult {
	assertPositive('ratio', input.ratio)
	assertPositive('driveP', input.driveP)
	assertPositive('supplyVol', input.supplyVol)
	assertPositive('receiverVol', input.receiverVol)
	assertNonNegative('supplyStart', input.supplyStart)
	assertNonNegative('receiverStart', input.receiverStart)
	assertNonNegative('target', input.target)
	if (input.regulatedInletBar !== undefined)
		assertNonNegative('regulatedInletBar', input.regulatedInletBar)
	if (input.gas) assertGas(input.gas)
	const { ratio, driveP, supplyVol: vs, receiverVol: vr, target } = input
	const maxOutput = ratio * driveP
	const { eqPressure, boostStartReceiver, inletStartAbs } = boostSetup(input)
	const finalSupplyNoBoost = inletStartAbs - ATM
	const capAbs =
		input.regulatedInletBar !== undefined
			? input.regulatedInletBar + ATM
			: Infinity
	const boostStartAbs = boostStartReceiver + ATM
	const driveStart = boostStartReceiver / ratio
	const driveEnd = target / ratio

	if (target <= boostStartReceiver + 1e-9) {
		return {
			maxOutput,
			eqPressure,
			processGasL: 0,
			driveAirL: 0,
			finalSupply: finalSupplyNoBoost,
			feasible: true,
			driveStart,
			driveEnd,
		}
	}

	if (target > maxOutput) {
		return {
			maxOutput,
			eqPressure,
			processGasL: 0,
			driveAirL: 0,
			finalSupply: finalSupplyNoBoost,
			feasible: false,
			reason: 'exceeds-stall',
			driveStart,
			driveEnd,
		}
	}

	const q = vr * (target - boostStartReceiver)
	const availQ = vs * (inletStartAbs - ATM) // gas drawable down to 1 atm
	if (q > availQ + 1e-9) {
		return {
			maxOutput,
			eqPressure,
			processGasL: availQ,
			driveAirL: driveAirForQ(
				input,
				availQ,
				boostStartAbs,
				inletStartAbs,
				capAbs,
				vs,
				vr,
			),
			finalSupply: 0,
			feasible: false,
			reason: 'supply-insufficient',
			supplyLimitedMax: boostStartReceiver + availQ / vr,
			driveStart,
			driveEnd,
		}
	}

	const finalInletAbs = inletStartAbs - q / vs
	const driveAirL = driveAirForQ(
		input,
		q,
		boostStartAbs,
		inletStartAbs,
		capAbs,
		vs,
		vr,
	)
	return {
		maxOutput,
		eqPressure,
		processGasL: q,
		driveAirL,
		finalSupply: finalInletAbs - ATM,
		feasible: true,
		driveStart,
		driveEnd,
	}
}

/**
 * Place a booster fill on the clock: equalisation plus boost time, cycle rate and compressor duty.
 * Returns null when the booster geometry or fill-rate limit is missing.
 * @example boosterTiming({ driveAirL: 500, riseBar: 100, receiverVolL: 11.1, maxFillRateBarPerMin: 10, driveSweptL: 1, maxCpm: 60, ratio: 40, supplyAbsBar: 100, driveStartBar: 1, driveEndBar: 5, compressorRateLpm: 100 })?.fillSeconds
 */
export function boosterTiming(args: TimingArgs): BoosterTiming | null {
	const {
		driveAirL,
		riseBar,
		receiverVolL: vr,
		maxFillRateBarPerMin: maxRate,
		driveSweptL,
		maxCpm,
		ratio,
		supplyAbsBar,
		driveStartBar,
		driveEndBar,
		compressorRateLpm: C,
	} = args
	// Need the booster's geometry + a fill-rate limit to place the fill on time.
	if (!(driveSweptL > 0) || !(maxCpm > 0) || !(maxRate > 0) || !(ratio > 0)) {
		return null
	}

	const base = {
		driveStartBar,
		driveEndBar,
		dutyCycle: 0,
		dutyContinuous: false,
		stallSeconds: null as number | null,
	}
	const eqRiseBar = Math.max(0, args.eqRiseBar ?? 0)
	if (driveAirL <= 0 || riseBar <= 0) {
		// No boost, but a free-equalization transfer may still take time.
		const eqSeconds = (eqRiseBar / maxRate) * 60
		return {
			...base,
			fillSeconds: eqSeconds,
			eqSeconds,
			boostSeconds: 0,
			boosterLimited: false,
			driveAirRateLpm: 0,
			cycleRatePerSec: 0,
		}
	}

	// Gas delivered to the receiver per cycle (surface L): the gas piston draws a
	// gulp of supply gas (gasSwept = driveSwept / ratio) at the supply pressure.
	// Real gas: moles ∝ P/Z, so a gulp holds 1/Z as much.
	const zSupply = args.useRealGas ? mixZ(args.gas ?? AIR, supplyAbsBar) : 1
	const gasPerCycle = ((driveSweptL / ratio) * (supplyAbsBar / ATM)) / zSupply
	// The booster's own ceiling on fill rate (bar/min), then the actual boost
	// rate is the lower of that and the O2 limit. Equalization isn't booster-
	// limited, so it runs at the O2 rate.
	const boosterMaxRate =
		gasPerCycle > 0 ? (maxCpm * gasPerCycle) / vr : Infinity
	const boostRate = Math.min(maxRate, boosterMaxRate)
	const boosterLimited = boosterMaxRate < maxRate
	const eqSeconds = (eqRiseBar / maxRate) * 60
	const boostSeconds = (riseBar / boostRate) * 60
	const fillSeconds = eqSeconds + boostSeconds

	// cycles/sec = (gas delivered per min) / gasPerCycle / 60 (during boosting)
	const cycleRatePerSec =
		gasPerCycle > 0 ? (vr * boostRate) / gasPerCycle / 60 : 0
	// Drive-air rate is the demand while the booster is actually running.
	const driveAirRateLpm = boostSeconds > 0 ? (driveAirL / boostSeconds) * 60 : 0

	const hasCompressor = C > 0
	let dutyCycle = 0
	let dutyContinuous = false
	let stallSeconds: number | null = null
	if (hasCompressor) {
		dutyCycle = Math.min(1, driveAirRateLpm / C)
		dutyContinuous = C < driveAirRateLpm
		// Storage must cover the deficit. The usable buffer is the gas between
		// cut-out and the (highest) drive pressure needed; once the tank bleeds to
		// the drive pressure the regulator can't hold it and the booster stalls.
		const { storageL, storageMaxBar, storageMinBar } = args
		const hasBuffer =
			!!storageL && storageMaxBar != null && storageMinBar != null
		if (dutyContinuous && hasBuffer) {
			const buffer = Math.max(0, storageL * (storageMaxBar - driveEndBar))
			const deficit = driveAirRateLpm - C
			const drainSeconds = deficit > 0 ? (buffer / deficit) * 60 : Infinity
			// The booster only draws while boosting, so the stall is offset by the
			// equalization transfer that precedes it.
			if (drainSeconds < boostSeconds) stallSeconds = eqSeconds + drainSeconds
		}
	}

	return {
		...base,
		fillSeconds,
		eqSeconds,
		boostSeconds,
		boosterLimited,
		driveAirRateLpm,
		cycleRatePerSec,
		dutyCycle,
		dutyContinuous,
		stallSeconds,
	}
}

/**
 * Sample receiver pressure, cumulative drive air and supply pressure across a booster fill.
 * @example boosterFillProfile({ ratio: 40, driveP: 8, supplyVol: 50, supplyStart: 150, receiverVol: 11.1, receiverStart: 0, target: 200 }, 10).length // 11
 */
export function boosterFillProfile(
	input: BoosterInput,
	steps = 40,
	timing?: TimingArgs,
): ProfilePoint[] {
	const { ratio, supplyVol: vs, receiverVol: vr, receiverStart, target } = input
	const { boostStartReceiver, inletStartAbs } = boostSetup(input)
	const boostStartAbs = boostStartReceiver + ATM
	const supplyStartAbs = input.supplyStart + ATM
	const capAbs =
		input.regulatedInletBar !== undefined
			? input.regulatedInletBar + ATM
			: Infinity
	const summary = booster(input)
	const reached = summary.feasible
		? target
		: (summary.supplyLimitedMax ?? boostStartReceiver)
	// No boost phase (equalization alone reaches the target) → no booster profile.
	if (reached <= boostStartReceiver + 1e-9) return []

	const tm = timing ? boosterTiming(timing) : null
	const C = timing?.compressorRateLpm ?? 0
	const storageL = timing?.storageL ?? 0
	const cutout = timing?.storageMaxBar ?? 0
	const hasBuffer = !!(tm && storageL > 0 && cutout > 0 && C > 0)
	const eqSeconds = tm?.eqSeconds ?? 0
	const boostSeconds = tm?.boostSeconds ?? 0
	const eqRise = boostStartReceiver - receiverStart
	const boostRise = reached - boostStartReceiver

	// Span the whole fill: the equalization transfer (receiverStart → boost start)
	// then the boost phase. Both deplete the supply; only the boost phase consumes
	// drive air.
	const rise = reached - receiverStart

	const points: ProfilePoint[] = []
	let prevDrive = 0
	let prevTime = 0
	for (let i = 0; i <= steps; i++) {
		const receiverP = receiverStart + (rise * i) / steps
		// Total gas drawn from the supply (equalization + boost).
		const qTotal = vr * (receiverP - receiverStart)
		const supplyP = supplyStartAbs - qTotal / vs - ATM
		const boosting = receiverP > boostStartReceiver + 1e-9
		const cumulativeDriveL = boosting
			? driveAirForQ(
					input,
					vr * (receiverP - boostStartReceiver),
					boostStartAbs,
					inletStartAbs,
					capAbs,
					vs,
					vr,
				)
			: 0
		const point: ProfilePoint = { receiverP, cumulativeDriveL, supplyP }
		if (tm) {
			// Two-rate timeline: equalization then boosting.
			const timeSeconds = boosting
				? eqSeconds +
					(boostRise > 0
						? (boostSeconds * (receiverP - boostStartReceiver)) / boostRise
						: 0)
				: eqRise > 0
					? (eqSeconds * (receiverP - receiverStart)) / eqRise
					: 0
			point.timeSeconds = timeSeconds
			point.drivePBar = receiverP / ratio
			point.cycleRatePerSec = boosting ? tm.cycleRatePerSec : 0
			if (hasBuffer) {
				// Storage runs continuously: full + compressor in − booster out
				// (clamped — it can't exceed cut-out while topped off).
				const minutes = timeSeconds / 60
				const storageGas = storageL * cutout + C * minutes - cumulativeDriveL
				point.driveBufferFrac = Math.max(
					0,
					Math.min(1, storageGas / (storageL * cutout)),
				)
				const dDrive = cumulativeDriveL - prevDrive
				const dt = timeSeconds - prevTime
				const boosterDrawLpm = dt > 0 ? (dDrive / dt) * 60 : 0
				point.storageDrawLpm = Math.max(0, boosterDrawLpm - C)
			}
			prevDrive = cumulativeDriveL
			prevTime = timeSeconds
		}
		points.push(point)
	}
	return points
}
