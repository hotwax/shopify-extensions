import React from 'react'

import { Tile, reactExtension, useApi } from '@shopify/ui-extensions-react/point-of-sale'

const PickupTileComponent = () => {
  const api = useApi()
  return (
    <Tile
      title="Pickup and Delivery Options"
      onPress={() => {
        api.action.presentModal()
      }}
      enabled
    />
  )
}

export default reactExtension('pos.home.tile.render', () => {
  return <PickupTileComponent />
})
