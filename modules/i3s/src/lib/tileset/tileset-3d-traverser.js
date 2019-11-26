// This file is derived from the Cesium code base under Apache 2 license
// See LICENSE.md and https://github.com/AnalyticalGraphicsInc/cesium/blob/master/LICENSE.md

import {TILE3D_REFINEMENT} from '../constants';
import ManagedArray from '../utils/managed-array';
import Tile3DHeader from './tile-3d-header';
import {lodJudge} from './utils';

export default class Tileset3DTraverser {
  constructor(options = {}) {
    this.traversal = {
      stack: new ManagedArray(),
      stackMaximumLength: 0
    };

    this.emptyTraversal = {
      stack: new ManagedArray(),
      stackMaximumLength: 0
    };

    this.result = {
      selectedTiles: [],
      _requestedTiles: [],
      _emptyTiles: [],
      _hasMixedContent: false
    };

    this._basePath = options.basePath;

    // persist fetched tile headers
    this._tileHeaderMap = {};
  }

  async traverse(root, frameState, options) {
    this.root = root; // for root screen space error
    this.options = options;

    this.result.selectedTiles.length = 0;
    this.result._requestedTiles.length = 0;
    this.result._emptyTiles.length = 0;
    this.result._hasMixedContent = false;

    this.updateTile(root, frameState);

    // The root tile is not visible
    if (!root.isVisibleAndInRequestVolume) {
      return false;
    }

    // The this doesn't meet the SSE requirement, therefore the tree does not need to be rendered
    // The alwaysLoadRoot is better solved by moving the camera to the newly selected asset.
    if (root.getScreenSpaceError(frameState, true) <= options.maximumScreenSpaceError) {
      return false;
    }

    const baseScreenSpaceError = options.maximumScreenSpaceError;
    await this.executeTraversal(root, baseScreenSpaceError, frameState);

    this.traversal.stack.trim(this.traversal.stackMaximumLength);
    this.emptyTraversal.stack.trim(this.emptyTraversal.stackMaximumLength);

    return true;
  }

  selectTile(tile, frameState) {
    tile._selectedFrame = frameState.frameNumber;
    this.result.selectedTiles.push(tile);
  }

  selectDesiredTile(tile, frameState) {
    if (tile.contentAvailable) {
      // The tile can be selected right away and does not require traverseAndSelect
      this.selectTile(tile, frameState);
    }
  }

  touchTile(tile, frameState) {
    tile.tileset._cache.touch(tile);
    tile._touchedFrame = frameState.frameNumber;
  }

  // If skipLevelOfDetail is off try to load child tiles as soon as possible so that their parent can refine sooner.
  // Additive tiles are prioritized by distance because it subjectively looks better.
  // Replacement tiles are prioritized by screen space error.
  // A tileset that has both additive and replacement tiles may not prioritize tiles as effectively since SSE and distance
  // are different types of values. Maybe all priorities need to be normalized to 0-1 range.
  getPriority(tile) {
    return tile._priority;
    // const {options} = this;
    // switch (tile.refine) {
    //   case TILE3D_REFINEMENT.ADD:
    //     return tile._distanceToCamera;
    //
    //   case TILE3D_REFINEMENT.REPLACE:
    //     const {parent} = tile;
    //     const useParentScreenSpaceError =
    //       parent &&
    //       (!options.skipLevelOfDetail ||
    //         tile._screenSpaceError === 0.0 ||
    //         parent.hasTilesetContent);
    //     const screenSpaceError = useParentScreenSpaceError
    //       ? parent._screenSpaceError
    //       : tile._screenSpaceError;
    //     const rootScreenSpaceError = this.root._screenSpaceError;
    //     return rootScreenSpaceError - screenSpaceError; // Map higher SSE to lower values (e.g. root tile is highest priority)
    //
    //   default:
    //     return assert(false);
    // }
  }

  loadTile(tile, frameState) {
    if (tile.hasUnloadedContent || tile.contentExpired) {
      tile._requestedFrame = frameState.frameNumber;
      tile._priority = this.getPriority(tile);
      if (!this.result._requestedTiles.find(t => t.id === tile.id)) {
        this.result._requestedTiles.push(tile);
      }
    }
  }

  anyChildrenVisible(tile, frameState) {
    let anyVisible = false;
    for (const child of tile.children) {
      child.updateVisibility(frameState);
      anyVisible = anyVisible || child.isVisibleAndInRequestVolume;
    }
    return anyVisible;
  }

  meetsScreenSpaceErrorEarly(tile, frameState) {
    const {parent} = tile;
    const {options} = this;
    if (!parent || parent.hasTilesetContent || parent.refine !== TILE3D_REFINEMENT.ADD) {
      return false;
    }

    // Use parent's geometric error with child's box to see if the tile already meet the SSE
    return tile.getScreenSpaceError(frameState, true) <= options.maximumScreenSpaceError;
  }

  updateTileVisibility(tile, frameState) {
    tile.updateVisibility(frameState);
  }

  updateTile(tile, frameState) {
    this.updateTileVisibility(tile, frameState);
    tile.updateExpiration();
  }

  // eslint-disable-next-line complexity
  async updateAndPushChildren(tile, stack, frameState) {
    // tile._header.children are available right away when `tile` itself is fetched
    // tile.children are only those children which are fetched
    const children = tile._header.children || [];
    const childrenTiles = tile.children || [];

    for (const child of children) {
      let childTile = this._tileHeaderMap[child.id];

      // if child tile is not requested or fetched
      if (!childTile) {
        this._tileHeaderMap[child.id] = {};
        const header = await fetchTileNode(this._basePath, child.id);

        // after child tile is fetched
        childTile = new Tile3DHeader(tile.tileset, header, tile, this._basePath);
        tile.children.push(childTile);
        this._tileHeaderMap[child.id] = childTile;
      }

      // if child tile is fetched and available
      if (childTile._header) {
        this.updateTile(childTile, frameState);
      }
    }

    // Sort by distance to take advantage
    children.sort((c1, c2) => c1._priority - c2._priority);

    // For traditional replacement refinement only refine if all children are loaded.
    // Empty tiles are exempt since it looks better if children stream in as they are loaded to fill the empty space.
    const checkRefines =
      tile.refine === TILE3D_REFINEMENT.REPLACE &&
      tile.hasRenderContent;

    let refines = true;
    let hasVisibleChild = false;

    for (const child of childrenTiles) {
      if (child.isVisibleAndInRequestVolume) {
        stack.push(child);
        hasVisibleChild = true;
      } else if (checkRefines) {
        // Keep non-visible children loaded since they are still needed before the parent can refine.
        // Or loadSiblings is true so always load tiles regardless of visibility.
        this.loadTile(child, frameState);
        this.touchTile(child, frameState);
      }

      if (checkRefines) {
        let childRefines;
        if (!child._inRequestVolume) {
          childRefines = false;
        } else if (!child.hasRenderContent) {
          childRefines = this.executeEmptyTraversal(child, frameState);
        } else {
          childRefines = child.contentAvailable;
        }
        refines = refines && childRefines;
      }
    }

    if (!hasVisibleChild) {
      refines = false;
    }

    return refines;
  }

  canTraverse(tile, frameState) {
    return lodJudge(tile, frameState);
  }

  // Depth-first traversal that traverses all visible tiles and marks tiles for selection.
  // If skipLevelOfDetail is off then a tile does not refine until all children are loaded.
  // This is the traditional replacement refinement approach and is called the base traversal.
  // Tiles that have a greater screen space error than the base screen space error are part of the base traversal,
  // all other tiles are part of the skip traversal. The skip traversal allows for skipping levels of the tree
  // and rendering children and parent tiles simultaneously.

  // eslint-disable-next-line max-statements, complexity
  async executeTraversal(root, baseScreenSpaceError, frameState) {
    const {traversal} = this;
    const {stack} = traversal;
    stack.push(root);

    while (stack.length > 0) {
      traversal.stackMaximumLength = Math.max(traversal.stackMaximumLength, stack.length);

      const tile = stack.pop();
      const add = tile.refine === TILE3D_REFINEMENT.ADD;
      const replace = tile.refine === TILE3D_REFINEMENT.REPLACE;
      const parent = tile.parent;
      const parentRefines = !parent || parent._refines;

      let refines = false;

      const result = this.canTraverse(tile, frameState);

      if (result === 'OUR') {
        continue;
      }
      if (result === 'DIG') {
        refines = await this.updateAndPushChildren(tile, stack, frameState);
      }

      const stoppedRefining = !refines && parentRefines;

      if (!tile.hasRenderContent) {
        // Add empty tile just to show its debug bounding volume
        // If the tile has this content load the external this
        // If the tile cannot refine further select its nearest loaded ancestor
        this.result._emptyTiles.push(tile);
        this.loadTile(tile, frameState);
        if (stoppedRefining) {
          this.selectDesiredTile(tile, frameState);
        }
      } else if (add) {
        // Additive tiles are always loaded and selected
        this.loadTile(tile, frameState);
        this.selectDesiredTile(tile, frameState);
      } else if (replace) {
        // Always load tiles in the base traversal
        // Select tiles that can't refine further
        this.loadTile(tile, frameState);
        // if (stoppedRefining) {
          this.selectDesiredTile(tile, frameState);
        // }
      }

      this.touchTile(tile, frameState);
      tile._refines = refines;
    }
  }

  // Depth-first traversal that checks if all nearest descendants with content are loaded. Ignores visibility.
  executeEmptyTraversal(root, frameState) {
    let allDescendantsLoaded = true;
    const {emptyTraversal} = this;
    const stack = emptyTraversal.stack;
    stack.push(root);

    while (stack.length > 0) {
      emptyTraversal.stackMaximumLength = Math.max(emptyTraversal.stackMaximumLength, stack.length);

      const tile = stack.pop();

      // Only traverse if the tile is empty - traversal stop at descendants with content
      const traverse = !tile.hasRenderContent && this.canTraverse(tile);

      // Traversal stops but the tile does not have content yet.
      // There will be holes if the parent tries to refine to its children, so don't refine.
      if (!traverse && !tile.contentAvailable) {
        allDescendantsLoaded = false;
      }

      this.updateTile(tile, frameState);
      if (!tile.isVisibleAndInRequestVolume) {
        // Load tiles that aren't visible since they are still needed for the parent to refine
        this.loadTile(tile, frameState);
        this.touchTile(tile, frameState);
      }

      if (traverse) {
        const children = tile.children;
        for (const child of children) {
          stack.push(child);
        }
      }
    }

    return allDescendantsLoaded;
  }
}

async function fetchTileNode(basePath, nodeId) {
  const nodeUrl = `${basePath}/nodes/${nodeId}`;
  return await fetch(nodeUrl).then(resp => resp.json());
}

