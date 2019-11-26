/* global fetch */
import {Vector3} from 'math.gl';

import {COORDINATE_SYSTEM, CompositeLayer} from '@deck.gl/core';
import {SimpleMeshLayer} from '@deck.gl/mesh-layers';

import {I3STileset, I3STileset3D} from '@loaders.gl/i3s';
import {Geometry, Texture2D, Transform, Buffer} from '@luma.gl/core';
import GL from '@luma.gl/constants';
import {getFrameState} from './get-frame-state';
import vs_max_min_z from './min-vs.glsl';

const MAX_LAYERS = 100;

const scratchOffset = new Vector3(0, 0, 0);

const TEXTURE_OPTIONS = {
  mipmaps: false,
  parameters: {
    [GL.TEXTURE_MAG_FILTER]: GL.LINEAR,
    [GL.TEXTURE_MIN_FILTER]: GL.LINEAR,
    [GL.TEXTURE_WRAP_S]: GL.CLAMP_TO_EDGE,
    [GL.TEXTURE_WRAP_T]: GL.CLAMP_TO_EDGE
  },
  dataFormat: GL.RGBA
};
const defaultProps = {
  data: null,
  loadOptions: {throttleRequests: true},
  onTilesetLoad: tileset3d => {
  },
  onTileLoad: tileHeader => {
  },
  onTileUnload: tileHeader => {
  }
};

function getRootNodeUrl(tilesetUrl) {
  return `${tilesetUrl}/nodes/root`;
}

export default class Tile3DLayer extends CompositeLayer {
  initializeState() {
    const maxMinZTransform = this._createTransform();
    this.setState({
      layerMap: {},
      tileset3d: null,
      maxMinZTransform
    });
  }

  shouldUpdateState({changeFlags}) {
    return changeFlags.somethingChanged;
  }

  async updateState({props, oldProps}) {
    if (props.data && props.data !== oldProps.data) {
      await this._loadTileset(props.data);
    }

    const {tileset3d} = this.state;
    await this._updateTileset(tileset3d);
  }

  async _loadTileset(tilesetUrl, fetchOptions) {
    const response = await fetch(tilesetUrl, fetchOptions);
    const tilesetJson = await response.json();
    const rootNodeUrl = getRootNodeUrl(tilesetUrl);
    tilesetJson.root = await fetch(rootNodeUrl, fetchOptions).then(resp => resp.json());
    tilesetJson.refine = 'REPLACE';

    const tileset3d = new I3STileset3D(tilesetJson, tilesetUrl, {
      basePath: tilesetUrl,
      onTileLoad: tile => this.props.onTileLoad(tile),
      onTileUnload: tile => this.props.onTileUnload(tile)
    });

    this.setState({
      tileset3d,
      layerMap: {}
    });

    if (tileset3d) {
      this.props.onTilesetLoad(tileset3d);
    }
  }

  async _updateTileset(tileset3d) {
    const {timeline, viewport} = this.context;
    if (!timeline || !viewport || !tileset3d) {
      return;
    }

    // TODO use a valid frameState
    const frameState = getFrameState(viewport, Date.now());
    await tileset3d.update(frameState);
    this._updateLayerMap();
  }

  _updateLayerMap() {
    const {tileset3d, layerMap} = this.state;

    // create layers for new tiles
    const {selectedTiles} = tileset3d;
    if (selectedTiles) {
      const tilesWithoutLayer = Object.values(selectedTiles).filter(
        tile => !layerMap[tile.id] && tile.content
      );

      for (const tile of tilesWithoutLayer) {
        layerMap[tile.id] = {
          layer: this._create3DTileLayer(tile),
          tile
        };
      }
    }

    // only maintain certain layers for performance
    // this._deleteLayers();

    // update layer visibility
    this._updateLayers();
  }

  _createTransform(shaderOptions = {}) {
    const {gl} = this.context;
    let {maxMinZTransform} = this.state;
    if (maxMinZTransform) {
      maxMinZTransform.delete();
    }
    const maxMinZTexture = new Texture2D(gl, {format: GL.RGBA32F, type: GL.FLOAT, ...TEXTURE_OPTIONS}); // 1 X 1 texture,
    maxMinZTransform = new Transform(gl, {
      id: `${this.id}-max-weights-transform`,
      sourceBuffers: {
        positions: new Buffer(gl)
      },
      _targetTexture: maxMinZTexture,
      _targetTextureVarying: 'maxMinZ',
      vs: vs_max_min_z,
      elementCount: 1
    });
    return maxMinZTransform;
  }

  // Grab only those layers who were selected this frame.
  _updateLayers() {
    const {layerMap, tileset3d} = this.state;
    const selectedTiles = tileset3d && tileset3d.selectedTiles;

    const tileIds = Object.keys(layerMap);
    for (let i = 0; i < tileIds.length; i++) {
      const tileId = tileIds[i];
      const selected = selectedTiles.find(tile => tile.id === tileId);
      let layer = layerMap[tileId].layer;
      if (!selected && layer.props && layer.props.visible) {
        // Still has GPU resource but visibility is turned off so turn it back on so we can render it.
        layer = layer.clone({visible: false});
        layerMap[tileId].layer = layer;
      } else if (selected && layer.props) {
        // Still has GPU resource but visibility is turned off so turn it back on so we can render it.
        if (!layer.props.visible) {
          layer = layer.clone({visible: true});
        }
        layerMap[tileId].layer = layer;
      }
    }

    this.setState({layers: Object.values(layerMap).map(layer => layer.layer)});
  }

  _create3DTileLayer(tile) {
    const content = tile.content;
    const {attributes, matrix, cartographicOrigin, texture} = content;
    const positions = new Float32Array(attributes.position.value.length);

    const transform = this.state.maxMinZTransform;
    const buffer = new Buffer(
      this.context.gl, {
        data: new Float32Array(attributes.position.value)
      });

    transform.update({
      sourceBuffers: {
        positions: buffer
      },
      elementCount: 10, //positions.length / 3
    });
    transform.run({
      parameters: {
        blend: true,
        depthTest: false,
        blendFunc: [GL.ONE, GL.ONE],
        blendEquation: [GL.MIN, GL.MAX]
      },
      clearRenderTarget: true
    });

    const results = transform.getData();
    console.log(tile.id, positions.length / 3, results, tile.content.minHeight, tile.content.maxHeight);

    for (let i = 0; i < positions.length; i += 3) {
      scratchOffset.copy(matrix.transform(attributes.position.value.subarray(i, i + 3)));
      positions.set(scratchOffset, i);
    }

    const geometry = new Geometry({
      drawMode: GL.TRIANGLES,
      attributes: {
        positions,
        normals: attributes.normal,
        texCoords: attributes.uv0
      }
    });

    return new SimpleMeshLayer({
      id: `mesh-layer-${tile.id}`,
      mesh: geometry,
      data: [{}],
      getPosition: [0, 0, 0],
      getColor: [255, 255, 255],
      texture,
      coordinateOrigin: cartographicOrigin,
      coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS
    });
  }

  renderLayers() {
    return this.state.layers;
  }
}

Tile3DLayer.layerName = 'Tile3DLayer';
Tile3DLayer.defaultProps = defaultProps;
