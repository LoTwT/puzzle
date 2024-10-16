export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

export function shuffleArray<T>(array: T[]): T[] {
  const newArray = array.slice()
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[newArray[i], newArray[j]] = [newArray[j], newArray[i]]
  }
  return newArray
}
