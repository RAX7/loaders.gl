import ManagedArray from '../utils/managed-array';
import {TILE3D_REFINEMENT} from '../constants';

export default class BaseTilesetTraversal {
  // TODO nested props
  constructor() {
    // TRAVERSAL
    // temporary storage to hold the traversed tiles during a traversal
    this._traversalStack = new ManagedArray();
    // maximum length of the stack to avoid exhausting memory
    this._traversalStackMaxLength = 0;

    // fulfill in traverse call
    this.options = null;
    this.root = null;

    // RESULT
    // tiles should be rendered
    this.selectedTiles = {};
    // tiles should be loaded from server
    this._requestedTiles = {};
  }

  // goal is to decide which tiles should be visible
  traverse(root, frameState, options) {
    this.root = root; // for root screen space error
    this.options = options;

    // reset result
    this.reset();

    // update tile (visibility and expiration)
    this.updateTile(root, frameState);

    const judge = this.refineJudge(root, frameState);
    if (judge === 'OUT') {
      return false;
    }

    const baseScreenSpaceError = options.maximumScreenSpaceError;
    this.executeTraversal(root, baseScreenSpaceError, frameState);

    this.postTraversal(root, frameState, options);

    return true;

    // check if root is visible
    //  - if not, return to avoid further traversal (should be culled)

    // check if root LoD is sufficient
    //  - check screenSpaceError

    // execute traversal
  }

  reset() {
    this._requestedTiles.length = 0;
    this.selectedTiles.length = 0;
  }

  postTraversal(root, frameState, options) {
    this._traversalStack.trim(this._traversalStackMaxLength);
  }

  // execute traverse
  executeTraversal(root, frameState, options) {
    // stack to store traversed tiles, only visible tiles should be added to stack
    // visible: visible in the current view frustum
    const stack = this._traversalStack;
    stack.push(root);

    // while stack.isNotEmpty() {
    //   tile = stack.pop()
    //   type = add or replace
    //
    //   shouldRefine = refineJudge(tile, stack) // update stack with visible children tiles, and return should refine
    //     tile's LoD is not sufficient && has children && some children are visible and content available
    //
    //   if (type === add or !shouldRefine) {
    //     - addTileToSelectedMap
    //   }
    //
    //   - addTileToLoadQueue if tile has data but not loaded
    //   - update cache
    // }
    while (stack.length > 0) {
      this._traversalStackMaxLength = Math.max(this._traversalStackMaxLength, stack.length);

      const tile = stack.pop();

      const judge = this.refineJudge(tile, frameState, stack);

      if (judge === 'SELECT') {
        this.selectTile(tile, frameState);
        this.loadTile(tile, frameState);
      } else if (judge === 'LOAD') {
        // request tile from server
        this.loadTile(tile, frameState);
      }

      // update cache
      this.touchTile(tile, frameState);
    }
  }

  refineJudge(tile, frameState) {
    assert('Subclass should implement this method.');
    // should select current tile?
    // should traverse children?

    // cannot traverse - no children
    // do not need to traverse - screenSpaceError is sufficient
  }



  updateTile(tile, frameState) {
    tile.updateVisibility(frameState);
  }

  // tile to render in the browser
  selectTile(tile, frameState) {
    this.selectedTiles[tile.id] = tile;
  }

  // tile to load from server
  loadTile(tile, frameState) {
    if (tile.hasUnloadedContent || tile.contentExpired) {
      tile._priority = tile.getPriority();
      this._requestedTiles[tile.id] = tile;
    }
  }

  // cache tile
  touchTile(tile, frameState) {
    tile.tileset._cache.touch(tile);
    tile._touchedFrame = frameState.frameNumber;
  }
}

// TODO
// expiration
// optimization hint
