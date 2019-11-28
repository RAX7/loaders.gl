// This file is derived from the Cesium code base under Apache 2 license
// See LICENSE.md and https://github.com/AnalyticalGraphicsInc/cesium/blob/master/LICENSE.md

import {TILE3D_REFINEMENT, TILE3D_OPTIMIZATION_HINT} from '../constants';
import BaseTilesetTraverser from './base-tileset-traverser';

export default class Tileset3DTraverser extends BaseTilesetTraverser {
  compareDistanceToCamera(a, b) {
    // Sort by farthest child first since this is going on a stack
    return b._distanceToCamera === 0 && a._distanceToCamera === 0
      ? b._centerZDepth - a._centerZDepth
      : b._distanceToCamera - a._distanceToCamera;
  }

  updateTileVisibility(tile, frameState) {
    tile.updateVisibility(frameState);

    //  Optimization - if none of the tile's children are visible then this tile isn't visible
    if (!tile.isVisibleAndInRequestVolume) {
      return;
    }

    const hasChildren = tile.children.length > 0;
    if (tile.hasTilesetContent && hasChildren) {
      // Use the root tile's visibility instead of this tile's visibility.
      // The root tile may be culled by the children bounds optimization in which
      // case this tile should also be culled.
      const firstChild = tile.children[0];
      this.updateTileVisibility(firstChild, frameState);
      tile._visible = firstChild._visible;
      return;
    }

    if (this.meetsScreenSpaceErrorEarly(tile, frameState)) {
      tile._visible = false;
      return;
    }

    const replace = tile.refine === TILE3D_REFINEMENT.REPLACE;
    const useOptimization =
      tile._optimChildrenWithinParent === TILE3D_OPTIMIZATION_HINT.USE_OPTIMIZATION;
    if (replace && useOptimization && hasChildren) {
      if (!this.anyChildrenVisible(tile, frameState)) {
        tile._visible = false;
        return;
      }
    }
  }

  meetsScreenSpaceErrorEarly(tile, frameState) {
    const {parent} = tile;
    if (!parent || parent.hasTilesetContent || parent.refine !== TILE3D_REFINEMENT.ADD) {
      return false;
    }

    // Use parent's geometric error with child's box to see if the tile already meet the SSE
    return !this.shouldRefine(tile, frameState, true);
  }

  // eslint-disable-next-line complexity
  //   updateAndPushChildren(tile, frameState, stack) {
  //     const options = this.options;
  //     const {children} = tile;
  //
  //     for (const child of children) {
  //       this.updateTile(child, frameState);
  //     }
  //
  //     // Sort by distance to take advantage of early Z and reduce artifacts for skipLevelOfDetail
  //     children.sort(compareDistanceToCamera);
  //
  //     // For traditional replacement refinement only refine if all children are loaded.
  //     // Empty tiles are exempt since it looks better if children stream in as they are loaded to fill the empty space.
  //     const checkRefines =
  //       !options.skipLevelOfDetail &&
  //       tile.refine === TILE3D_REFINEMENT.REPLACE &&
  //       tile.hasRenderContent;
  //
  //     let refines = true;
  //
  //     let hasVisibleChild = false;
  //     for (const child of children) {
  //       if (child.isVisibleAndInRequestVolume) {
  //         stack.push(child);
  //         hasVisibleChild = true;
  //       } else if (checkRefines || options.loadSiblings) {
  //         // Keep non-visible children loaded since they are still needed before the parent can refine.
  //         // Or loadSiblings is true so always load tiles regardless of visibility.
  //         this.loadTile(child, frameState);
  //         this.touchTile(child, frameState);
  //       }
  //
  //       if (checkRefines) {
  //         let childRefines;
  //         if (!child._inRequestVolume) {
  //           childRefines = false;
  //         } else if (!child.hasRenderContent) {
  //           childRefines = this._executeEmptyTraversal(child, frameState);
  //         } else {
  //           childRefines = child.contentAvailable;
  //         }
  //         refines = refines && childRefines;
  //       }
  //     }
  //
  //     if (!hasVisibleChild) {
  //       refines = false;
  //     }
  //
  //     return refines;
  //   }
  //
  //   // Depth-first traversal that checks if all nearest descendants with content are loaded. Ignores visibility.
  //   _executeEmptyTraversal(root, frameState) {
  //     let allDescendantsLoaded = true;
  //     const stack = this._emptyTraversalStack;
  //
  //     stack.push(root);
  //
  //     while (stack.length > 0) {
  //       this._emptyTraversalStackMaximumLength = Math.max(this._emptyTraversalStackMaximumLength, stack.length);
  //
  //       const tile = stack.pop();
  //
  //       this.updateTile(tile, frameState);
  //
  //       if (!tile.isVisibleAndInRequestVolume) {
  //         // Load tiles that aren't visible since they are still needed for the parent to refine
  //         this.loadTile(tile, frameState);
  //         this.touchTile(tile, frameState);
  //       }
  //
  //       // Only traverse if the tile is empty - traversal stop at descendants with content
  //       const traverse = !tile.hasRenderContent && this.canTraverse(tile);
  //
  //       // Traversal stops but the tile does not have content yet.
  //       // There will be holes if the parent tries to refine to its children, so don't refine.
  //       if (!traverse && !tile.contentAvailable) {
  //         allDescendantsLoaded = false;
  //       }
  //
  //       if (traverse) {
  //         const children = tile.children;
  //         for (const child of children) {
  //           stack.push(child);
  //         }
  //       }
  //     }
  //
  //     return allDescendantsLoaded;
  //   }
  // }
}
