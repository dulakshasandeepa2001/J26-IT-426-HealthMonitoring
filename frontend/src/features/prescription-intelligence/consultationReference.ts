// Lossless base-36 encoding: retain every UUID bit without database renumbering.
// Five groups are easier to read aloud/copy than the technical UUID.
export function consultationReference(id: string): string {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) return id;
  const encoded = BigInt("0x" + id.replaceAll("-", "")).toString(36).toUpperCase().padStart(25, "0");
  return "MT-" + encoded.match(/.{5}/g)!.join("-");
}
