export default `\
  attribute vec3 positions;
  varying vec4 maxMinZ;

  void main()
  {
    maxMinZ = vec4(positions.z, 0, 0, positions.z);
    gl_Position = vec4(0, 0, 0, 1.);
    gl_PointSize = 1.0;
  }
`;
