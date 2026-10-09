// Shared assertion harness for the scripts/verify-* suite. Each script runs
// in its own process (spawned by verify-all.mjs), so the failure counter is
// per-process.
let failures = 0

export function check(name, cond) {
  console.log(name, cond ? 'OK' : 'FAIL')
  if (!cond) failures++
}

export function eq(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export async function run(main, label = 'ALL OK') {
  try {
    await main()
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
  console.log(failures ? '\nFAILURES PRESENT' : `\n${label}`)
  process.exit(failures ? 1 : 0)
}
