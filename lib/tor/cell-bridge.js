export function createTorCellTransport(instance, name = 'tor-cell') {
  return {
    name,
    async connect(host, port) {
      return instance.connect(host, port)
    },
  }
}