const wordPattern = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu

export function wordCount(text: string): number {
  return text.match(wordPattern)?.length ?? 0
}
