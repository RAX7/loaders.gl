/* global fetch */
import {_BaseTilesetTraverser as BaseTilesetTraverser} from '@loaders.gl/3d-tiles';

import {lodJudge} from '../utils/lod';
import I3sTileHeader from './i3s-tile-header';

export default class I3STilesetTraverser extends BaseTilesetTraverser {
  constructor(options) {
    super(options);

    // persist fetched tile headers
    this._tileHeaderMap = {};
  }

  shouldRefine(tile, frameState) {
    // TODO refactor loaJudge
    return lodJudge(tile, frameState) === 'DIG';
  }

  // eslint-disable-next-line complexity
  async updateChildTiles(tile, frameState) {
    const {basePath} = this.options;
    const children = tile._header.children || [];

    for (const child of children) {
      let childTile = this._tileHeaderMap[child.id];

      // if child tile is not requested or fetched
      if (!childTile) {
        this._tileHeaderMap[child.id] = {};
        const header = await fetchTileNode(basePath, child.id);

        // after child tile is fetched
        childTile = new I3sTileHeader(tile.tileset, header, tile, basePath);
        tile.children.push(childTile);
        this._tileHeaderMap[child.id] = childTile;
      }

      // if child tile is fetched and available
      if (childTile._header) {
        this.updateTile(childTile, frameState);
      }
    }
  }
}

async function fetchTileNode(basePath, nodeId) {
  const nodeUrl = `${basePath}/nodes/${nodeId}`;
  return await fetch(nodeUrl).then(resp => resp.json());
}
