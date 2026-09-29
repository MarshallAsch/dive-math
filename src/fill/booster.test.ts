import fc from 'fast-check'
import { ATM_BAR } from '../pressure'
import { idealEquivalentPressure } from '../real-gas'
import { describe, it, expect } from 'vitest'
import {
	booster,
	boosterFillProfile,
	boosterTiming,
	type BoosterInput,
	type TimingArgs,
} from './booster'

const base: BoosterInput = {
	ratio: 30,
	driveP: 10, // max drive pressure available → stall ceiling 300 bar
	supplyVol: 50,
	supplyStart: 200,
	receiverVol: 12,
	receiverStart: 50,
	target: 200,
}

describe('booster', () => {
	it('equalizes a high supply into the receiver before boosting', () => {
		const r = booster(base)
		// P_eq ≈ ((50*201.013)+(12*51.013))/62 − 1.013 ≈ 170.97 bar gauge
		expect(r.eqPressure).toBeCloseTo(170.97, 1)
		expect(r.feasible).toBe(true)
	})
	it('drive air uses the actual back-pressure, not the stall ceiling', () => {
		// integrand receiverAbs/inletAbs runs ~1.0 → ~1.22 over q ≈ 348 L, so
		// drive air ≈ 1.1 × 348 ≈ 386 L — far below the old fixed-drive estimate.
		const r = booster(base)
		expect(r.processGasL).toBeCloseTo(348.4, 0)
		expect(r.driveAirL).toBeGreaterThan(380)
		expect(r.driveAirL).toBeLessThan(395)
	})
	it('reports the ramping drive-pressure range (≈ receiverP / ratio)', () => {
		const r = booster(base)
		expect(r.driveStart).toBeCloseTo(170.97 / 30, 1) // ≈ 5.7 bar
		expect(r.driveEnd).toBeCloseTo(200 / 30, 6) // ≈ 6.67 bar
	})
	it('needs no boost when equalization already reaches target', () => {
		const r = booster({ ...base, target: 150 })
		expect(r.driveAirL).toBe(0)
		expect(r.feasible).toBe(true)
	})
	it('is infeasible when the target exceeds the stall ceiling (ratio×driveP)', () => {
		const r = booster({ ...base, target: 350 }) // max = 30×10 = 300
		expect(r.feasible).toBe(false)
		expect(r.reason).toBe('exceeds-stall')
		expect(r.maxOutput).toBe(300)
	})
	it('flags a supply-limited fill and reports the reachable max', () => {
		const r = booster({
			...base,
			supplyVol: 2,
			receiverStart: 0,
			target: 280,
		})
		expect(r.feasible).toBe(false)
		expect(r.reason).toBe('supply-insufficient')
		expect(r.supplyLimitedMax).toBeGreaterThan(0)
		expect(r.supplyLimitedMax).toBeLessThan(280)
	})
})

describe('two-stage (regulated inlet)', () => {
	it('matches single-stage when the regulated inlet is above the supply', () => {
		const single = booster(base)
		const capped = booster({ ...base, regulatedInletBar: 1000 })
		expect(capped.driveAirL).toBeCloseTo(single.driveAirL, 4)
	})
	it('uses MORE drive air with a low regulated inlet (compressing from lower)', () => {
		const single = booster(base)
		const capped = booster({ ...base, regulatedInletBar: 60 })
		expect(capped.feasible).toBe(true)
		expect(capped.driveAirL).toBeGreaterThan(single.driveAirL)
	})
	it('hand-checked capped value (inlet held at the regulated pressure)', () => {
		// cap 60 bar → 61.013 abs, supply never falls to it over q ≈ 348, so the
		// inlet is constant: drive ≈ avgReceiverAbs/61.013 × 348 ≈ 3.06 × 348 ≈ 1065 L
		const r = booster({ ...base, regulatedInletBar: 60 })
		expect(r.driveAirL).toBeGreaterThan(1020)
		expect(r.driveAirL).toBeLessThan(1110)
	})
})

describe('real-gas (compressibility)', () => {
	it('useRealGas changes the equalization pressure and drive air for O2', () => {
		const ideal = booster(base)
		const real = booster({ ...base, gas: { fo2: 1, fhe: 0 }, useRealGas: true })
		expect(real.feasible).toBe(true)
		expect(real.driveAirL).toBeGreaterThan(0)
		expect(real.eqPressure).not.toBeCloseTo(ideal.eqPressure, 2)
	})
	// virial Z (MIGRATION.md): 1% agreement holds below 20 bar, not at 30
	it('ideal and real nearly agree at low pressure (Z → 1)', () => {
		const lowP = { ...base, supplyStart: 5, receiverStart: 0, target: 15 }
		const ideal = booster(lowP)
		const real = booster({ ...lowP, gas: { fo2: 1, fhe: 0 }, useRealGas: true })
		expect(
			Math.abs(real.driveAirL - ideal.driveAirL) / ideal.driveAirL,
		).toBeLessThan(0.01)
	})
})

describe('boosterFillProfile', () => {
	it('rises monotonically and ends at the summary drive-air total', () => {
		const profile = boosterFillProfile(base, 40)
		const summary = booster(base)
		expect(profile.length).toBe(41)
		expect(profile[0].cumulativeDriveL).toBeCloseTo(0, 6)
		for (let i = 1; i < profile.length; i++) {
			expect(profile[i].cumulativeDriveL).toBeGreaterThanOrEqual(
				profile[i - 1].cumulativeDriveL,
			)
		}
		const last = profile[profile.length - 1]
		expect(last.cumulativeDriveL).toBeCloseTo(summary.driveAirL, 1)
		expect(last.receiverP).toBeCloseTo(base.target, 6)
	})
	it('shows supply pressure falling as the supply depletes', () => {
		const profile = boosterFillProfile(base, 20)
		expect(profile[profile.length - 1].supplyP).toBeLessThan(profile[0].supplyP)
	})
	it('returns an empty profile when no boost is needed', () => {
		expect(boosterFillProfile({ ...base, target: 150 })).toEqual([])
	})
})

const timing: TimingArgs = {
	driveAirL: 350,
	riseBar: 200,
	receiverVolL: 5.7,
	maxFillRateBarPerMin: 20, // ≈ 290 psi/min
	driveSweptL: 1.0,
	maxCpm: 60,
	ratio: 40,
	supplyAbsBar: 200,
	driveStartBar: 0,
	driveEndBar: 5,
	compressorRateLpm: 100,
}

describe('boosterTiming', () => {
	it('returns null without the geometry / rate data', () => {
		expect(boosterTiming({ ...timing, driveSweptL: 0 })).toBeNull()
		expect(boosterTiming({ ...timing, maxCpm: 0 })).toBeNull()
		expect(boosterTiming({ ...timing, maxFillRateBarPerMin: 0 })).toBeNull()
	})
	it('fill time is set by the O2 fill-rate limit', () => {
		const r = boosterTiming(timing)!
		// 200 bar at 20 bar/min = 10 min, regardless of how fast the booster could go
		expect(r.fillSeconds).toBeCloseTo(600, 6)
		expect(r.boostSeconds).toBeCloseTo(600, 6)
		expect(r.eqSeconds).toBe(0)
		expect(r.boosterLimited).toBe(false)
	})
	it('free-equalization transfer counts toward the (rate-limited) fill time', () => {
		// 150 bar equalized for free + 200 bar boosted, both at 20 bar/min
		const r = boosterTiming({ ...timing, eqRiseBar: 150 })!
		expect(r.eqSeconds).toBeCloseTo((150 / 20) * 60, 6) // 450 s
		expect(r.boostSeconds).toBeCloseTo(600, 6)
		expect(r.fillSeconds).toBeCloseTo(1050, 6)
		// drive air is spread over the boost phase only, not the equalization
		expect(r.driveAirRateLpm).toBeCloseTo((350 / 600) * 60, 6)
	})
	it('reports a modest average drive-air rate and a sane cycle rate', () => {
		const r = boosterTiming(timing)!
		expect(r.driveAirRateLpm).toBeCloseTo(35, 6) // 350 L / 10 min
		// gasPerCycle = (1/40)*(200/1.013) ≈ 4.93 L; cyc/min = 5.7*20/4.93 ≈ 23
		expect(r.cycleRatePerSec).toBeCloseTo((5.7 * 20) / (4.935 * 60), 2)
		expect(r.cycleRatePerSec).toBeLessThan(1)
	})
	it('a tiny max cycle rate makes the booster the limiting factor', () => {
		const r = boosterTiming({ ...timing, maxCpm: 2 })!
		expect(r.boosterLimited).toBe(true)
		expect(r.fillSeconds).toBeGreaterThan(600)
		expect(r.cycleRatePerSec).toBeCloseTo(2 / 60, 4) // capped at maxCpm
	})
	it('compressor keeps up: duty < 1, no stall', () => {
		const r = boosterTiming(timing)! // 35 L/min draw vs 100 L/min compressor
		expect(r.dutyCycle).toBeCloseTo(0.35, 6)
		expect(r.dutyContinuous).toBe(false)
		expect(r.stallSeconds).toBeNull()
	})
	it('undersized compressor with a small buffer stalls before the fill ends', () => {
		const r = boosterTiming({
			...timing,
			compressorRateLpm: 10, // « 35 L/min draw
			storageL: 10,
			storageMaxBar: 12,
			storageMinBar: 9,
		})!
		expect(r.dutyContinuous).toBe(true)
		expect(r.stallSeconds).not.toBeNull()
		expect(r.stallSeconds!).toBeLessThan(r.fillSeconds)
	})
	it('zero boost ⇒ only the equalization transfer time', () => {
		const r = boosterTiming({ ...timing, driveAirL: 0, riseBar: 0 })!
		expect(r.fillSeconds).toBe(0)
		expect(r.cycleRatePerSec).toBe(0)
		const eq = boosterTiming({
			...timing,
			driveAirL: 0,
			riseBar: 0,
			eqRiseBar: 100,
		})!
		expect(eq.fillSeconds).toBeCloseTo((100 / 20) * 60, 6)
		expect(eq.boostSeconds).toBe(0)
	})
})

describe('boosterFillProfile timing fields', () => {
	const fullTiming: TimingArgs = {
		...timing,
		compressorRateLpm: 10,
		storageL: 10,
		storageMaxBar: 12,
		storageMinBar: 9,
	}
	it('omits time fields when no timing supplied', () => {
		const p = boosterFillProfile(base, 20)
		expect(p[0].timeSeconds).toBeUndefined()
		expect(p[0].drivePBar).toBeUndefined()
	})
	it('spans equalization + boost; time ends at total, drive pressure ramps', () => {
		const summary = booster(base)
		const t: TimingArgs = {
			...fullTiming,
			driveAirL: summary.driveAirL,
			riseBar: base.target - summary.eqPressure,
			eqRiseBar: summary.eqPressure - base.receiverStart,
		}
		const p = boosterFillProfile(base, 40, t)
		const tm = boosterTiming(t)!
		// profile starts at the receiver's actual start, not the equalized pressure
		expect(p[0].receiverP).toBeCloseTo(base.receiverStart, 6)
		expect(p[0].timeSeconds).toBeCloseTo(0, 6)
		for (let i = 1; i < p.length; i++) {
			expect(p[i].timeSeconds!).toBeGreaterThanOrEqual(p[i - 1].timeSeconds!)
		}
		expect(p[p.length - 1].timeSeconds!).toBeCloseTo(tm.fillSeconds, 1)
		expect(tm.eqSeconds).toBeGreaterThan(0) // equalization took real time
		// drive pressure = receiverP / ratio
		expect(p[p.length - 1].drivePBar!).toBeCloseTo(base.target / base.ratio, 6)
		// no drive air during equalization, then it accrues
		expect(p[0].cumulativeDriveL).toBe(0)
		expect(p[p.length - 1].cumulativeDriveL).toBeGreaterThan(0)
	})
	it('tracks the storage buffer falling from full when the compressor lags', () => {
		const summary = booster(base)
		const t: TimingArgs = {
			...fullTiming,
			driveAirL: summary.driveAirL,
			riseBar: base.target - summary.eqPressure,
			eqRiseBar: summary.eqPressure - base.receiverStart,
		}
		const p = boosterFillProfile(base, 40, t)
		expect(p[0].driveBufferFrac).toBeCloseTo(1, 2)
		expect(p[p.length - 1].driveBufferFrac!).toBeLessThan(1)
		expect(p[0].storageDrawLpm).toBeGreaterThanOrEqual(0)
	})
})

describe('booster (library additions)', () => {
	const base = {
		ratio: 40,
		driveP: 8,
		supplyVol: 50,
		supplyStart: 150,
		receiverVol: 11.1,
		receiverStart: 0,
		target: 200,
	}
	it('stall pressure is ratio × drive pressure', () =>
		expect(booster(base).maxOutput).toBe(320))
	it('reports exceeds-stall above ratio × drive', () => {
		const r = booster({ ...base, target: 400 })
		expect(r.feasible).toBe(false)
		expect(r.reason).toBe('exceeds-stall')
	})
	it('drive air is non-negative and grows with target (property)', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 60, max: 150, noNaN: true }),
				fc.double({ min: 150, max: 300, noNaN: true }),
				(a, b) => {
					const lo = booster({ ...base, target: a })
					const hi = booster({ ...base, target: b })
					return lo.driveAirL >= 0 && hi.driveAirL >= lo.driveAirL - 1e-9
				},
			),
		)
	})
	it('rejects bad input', () => {
		expect(() => booster({ ...base, ratio: 0 })).toThrow(RangeError)
		expect(() => booster({ ...base, receiverVol: NaN })).toThrow(RangeError)
		expect(() => booster({ ...base, gas: { fo2: 2, fhe: 0 } })).toThrow(
			RangeError,
		)
	})
})

describe('booster branch coverage', () => {
	const t: TimingArgs = { ...timing, compressorRateLpm: 10 }
	it('real-gas defaults the boosted gas to air', () => {
		const r = booster({ ...base, useRealGas: true })
		expect(r.feasible).toBe(true)
		expect(r.eqPressure).not.toBeCloseTo(booster(base).eqPressure, 3)
	})
	it('real-gas timing scales gas per cycle by 1/Z (default and explicit gas)', () => {
		const ideal = boosterTiming(timing)!
		const air = boosterTiming({ ...timing, useRealGas: true })!
		const o2 = boosterTiming({
			...timing,
			useRealGas: true,
			gas: { fo2: 1, fhe: 0 },
		})!
		expect(air.cycleRatePerSec).not.toBeCloseTo(ideal.cycleRatePerSec, 4)
		expect(o2.cycleRatePerSec).not.toBeCloseTo(air.cycleRatePerSec, 6)
	})
	it('no compressor means zero duty and no stall', () => {
		const r = boosterTiming({ ...timing, compressorRateLpm: 0 })!
		expect(r.dutyCycle).toBe(0)
		expect(r.dutyContinuous).toBe(false)
		expect(r.stallSeconds).toBeNull()
	})
	it('a compressor lagging without a buffer never reports a stall', () => {
		const r = boosterTiming(t)!
		expect(r.dutyContinuous).toBe(true)
		expect(r.stallSeconds).toBeNull()
	})
	it('a big buffer outlasts the fill, so no stall', () => {
		const r = boosterTiming({
			...t,
			storageL: 10000,
			storageMaxBar: 300,
			storageMinBar: 9,
		})!
		expect(r.dutyContinuous).toBe(true)
		expect(r.stallSeconds).toBeNull()
	})
	it('profile with timing but no storage has no buffer fields', () => {
		const p = boosterFillProfile(base, 10, { ...timing, compressorRateLpm: 0 })
		expect(p[0].timeSeconds).toBe(0)
		expect(p[0].driveBufferFrac).toBeUndefined()
	})
	it('profile timing without equalization starts boosting at time zero', () => {
		const noEq = { ...base, supplyStart: 40, receiverStart: 60 }
		const p = boosterFillProfile(noEq, 10, timing)
		expect(p[0].timeSeconds).toBe(0)
		expect(p[0].cycleRatePerSec).toBe(0)
		expect(p[10].cycleRatePerSec).toBeGreaterThan(0)
	})
	it('supply-limited fill profile stops at the reachable pressure', () => {
		const lim = { ...base, supplyVol: 2, receiverStart: 0, target: 280 }
		const p = boosterFillProfile(lim, 10)
		expect(p[10].receiverP).toBeCloseTo(booster(lim).supplyLimitedMax!, 6)
	})
	it('regulated inlet caps the profile drive air', () => {
		const p = boosterFillProfile({ ...base, regulatedInletBar: 60 }, 10)
		expect(p[10].cumulativeDriveL).toBeGreaterThan(
			boosterFillProfile(base, 10)[10].cumulativeDriveL,
		)
	})
	it('rejects a negative regulated inlet', () => {
		expect(() => booster({ ...base, regulatedInletBar: -1 })).toThrow(
			RangeError,
		)
	})
})

describe('booster input guards', () => {
	const numericFields = [
		'driveAirL',
		'riseBar',
		'eqRiseBar',
		'receiverVolL',
		'maxFillRateBarPerMin',
		'driveSweptL',
		'maxCpm',
		'ratio',
		'supplyAbsBar',
		'driveStartBar',
		'driveEndBar',
		'compressorRateLpm',
		'storageL',
		'storageMaxBar',
		'storageMinBar',
	] as const
	for (const field of numericFields) {
		it.each([NaN, Infinity, -1])(`boosterTiming rejects ${field} = %s`, (v) =>
			expect(() => boosterTiming({ ...timing, [field]: v })).toThrow(
				new RegExp(field),
			),
		)
	}
	it.each(['receiverVolL', 'supplyAbsBar'] as const)(
		'boosterTiming rejects %s = 0',
		(field) =>
			expect(() => boosterTiming({ ...timing, [field]: 0 })).toThrow(
				RangeError,
			),
	)
	it('boosterTiming rejects a bad gas', () =>
		expect(() => boosterTiming({ ...timing, gas: { fo2: 2, fhe: 0 } })).toThrow(
			RangeError,
		))
	it('boosterTiming still returns null for zero ratio', () =>
		expect(boosterTiming({ ...timing, ratio: 0 })).toBeNull())
	it.each([0, 1.5, -1, NaN])('boosterFillProfile rejects steps = %s', (v) =>
		expect(() => boosterFillProfile(base, v)).toThrow(/steps/),
	)
})

describe('booster real-gas equalisation conserves moles', () => {
	it('V·n(P) summed over supply and receiver is unchanged (property)', () => {
		const mixes = [
			{ fo2: 0.209, fhe: 0 },
			{ fo2: 1, fhe: 0 },
			{ fo2: 0, fhe: 1 },
		]
		fc.assert(
			fc.property(
				fc.constantFrom(...mixes),
				fc.double({ min: 5, max: 100, noNaN: true }),
				fc.double({ min: 50, max: 300, noNaN: true }),
				fc.double({ min: 3, max: 20, noNaN: true }),
				fc.double({ min: 0, max: 49, noNaN: true }),
				(g, supplyVol, supplyStart, receiverVol, receiverStart) => {
					const r = booster({
						...base,
						supplyVol,
						supplyStart,
						receiverVol,
						receiverStart,
						gas: g,
						useRealGas: true,
					})
					const n = (p: number) => idealEquivalentPressure(g, p + ATM_BAR)
					const before =
						supplyVol * n(supplyStart) + receiverVol * n(receiverStart)
					const after = (supplyVol + receiverVol) * n(r.eqPressure)
					return Math.abs(after - before) < 1e-6 * before
				},
			),
		)
	})
})
