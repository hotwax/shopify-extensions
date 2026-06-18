export function gidToId(gid: string): string {
  return gid.split("/").pop() ?? "";
}

export function idToGid(numericId: string): string {
  return `gid://shopify/Metaobject/${numericId}`;
}
