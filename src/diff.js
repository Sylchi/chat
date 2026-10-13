// Minimal line diff for the Studio review view. LCS dynamic programming when
// the files are small enough; a common prefix/suffix trim otherwise so memory
// stays bounded on large files.

const MAX_CELLS = 1500000

function coarse(a, b) {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }
  const out = []
  for (let i = 0; i < start; i += 1) out.push({ type: 'same', text: a[i] })
  for (let i = start; i < endA; i += 1) out.push({ type: 'del', text: a[i] })
  for (let i = start; i < endB; i += 1) out.push({ type: 'add', text: b[i] })
  for (let i = endA; i < a.length; i += 1) out.push({ type: 'same', text: a[i] })
  return out
}

function lines(text) {
  const value = String(text ?? '')
  return value === '' ? [] : value.split('\n')
}

export function lineDiff(before, after) {
  const a = lines(before)
  const b = lines(after)
  if (a.length * b.length > MAX_CELLS) return coarse(a, b)

  const n = a.length
  const m = b.length
  const w = m + 1
  const dp = new Int32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + (j + 1)] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)])
    }
  }

  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
      out.push({ type: 'del', text: a[i] })
      i += 1
    } else {
      out.push({ type: 'add', text: b[j] })
      j += 1
    }
  }
  while (i < n) {
    out.push({ type: 'del', text: a[i] })
    i += 1
  }
  while (j < m) {
    out.push({ type: 'add', text: b[j] })
    j += 1
  }
  return out
}

export function diffStats(rows) {
  let added = 0
  let removed = 0
  for (const row of rows) {
    if (row.type === 'add') added += 1
    else if (row.type === 'del') removed += 1
  }
  return { added, removed }
}
