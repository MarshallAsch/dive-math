// Regenerate test/fixtures/gasplanner/tissues.json from GasPlanner (MIT),
// pinned to one commit and run as a black box. Needs git and network.
//   node scripts/gasplanner/generate.mjs
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMMIT = 'a8c0eb02dd09bfab242ab76c6c27966bc415ff64'
const here = fileURLToPath(new URL('.', import.meta.url))
const root = fileURLToPath(new URL('../..', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'gasplanner-'))
// Outside the clone: npm would otherwise pick up GasPlanner's Angular package.json.
const deps = mkdtempSync(join(tmpdir(), 'gasplanner-deps-'))
const run = (cmd, args, cwd = tmp, env = process.env) =>
	execFileSync(cmd, args, {
		cwd,
		env,
		stdio: ['ignore', 'pipe', 'inherit'],
	}).toString()
try {
	run('git', ['init', '-q'])
	run('git', [
		'remote',
		'add',
		'origin',
		'https://github.com/jirkapok/GasPlanner.git',
	])
	run('git', ['fetch', '-q', '--depth', '1', 'origin', COMMIT])
	run('git', ['checkout', '-q', 'FETCH_HEAD'])
	// GasPlanner's lib only needs lodash. Give npm its own root so it never
	// walks up into another package.json.
	writeFileSync(join(deps, 'package.json'), '{"private":true}')
	run(
		'npm',
		[
			'install',
			'--no-save',
			'--no-package-lock',
			'--ignore-scripts',
			'lodash@4',
		],
		deps,
	)
	copyFileSync(join(here, 'driver.ts'), join(tmp, 'driver.ts'))
	copyFileSync(join(here, 'profiles.json'), join(tmp, 'profiles.json'))
	run(
		join(root, 'node_modules/.bin/esbuild'),
		[
			'driver.ts',
			'--bundle',
			'--platform=node',
			'--outfile=driver.cjs',
			'--log-level=error',
		],
		tmp,
		{ ...process.env, NODE_PATH: join(deps, 'node_modules') },
	)
	const json = run('node', ['driver.cjs'])
	writeFileSync(join(root, 'test/fixtures/gasplanner/tissues.json'), json)
	console.log('wrote test/fixtures/gasplanner/tissues.json')
} finally {
	rmSync(tmp, { recursive: true, force: true })
	rmSync(deps, { recursive: true, force: true })
}
