// Shared verbatim with the offline WebGL optical checks. vViewPosition comes from
// the *rendering* camera, not the visitor or a fixed CCTV camera. No vertex work.
export const VILLA_MIRROR_LOOKUP = /* glsl */`
  uniform highp sampler2DArray villaMirrorPlate;
  uniform vec3 villaMirrorEye, villaMirrorAxis, villaMirrorLo, villaMirrorHi;
  uniform vec4 villaMirrorWeights;
  vec2 villaRoomUV(vec3 p, vec3 r) {
    // The gym silver sits just outside its surveyed inner wall. Start the ray
    // inside the box; parallel axes must never select the near/back plane.
    p = clamp(p, villaMirrorLo + .0001, villaMirrorHi - .0001);
    vec3 wall = mix(villaMirrorLo, villaMirrorHi, step(vec3(0.), r));
    vec3 exitT = abs(wall - p) / max(abs(r), vec3(.000001));
    vec3 q = p + r * min(min(exitT.x, exitT.y), exitT.z) - villaMirrorEye;
    vec3 right = cross(villaMirrorAxis, vec3(0.,1.,0.));
    float x = dot(q, right), y = q.y, z = max(dot(q, villaMirrorAxis), 0.);
    // Hemi-octahedron, row 0 / sampler v=0 is TOP in each uploaded slice.
    return .5 + .5 * vec2(x + y, x - y) / max(abs(x) + abs(y) + z, .000001);
  }
  vec3 villaRoomRadiance(vec2 uv, float layer) {
    vec3 c = texture(villaMirrorPlate, vec3(uv, layer)).rgb;
    // Hardware has removed sRGB. Invert the authoring camera's reversible
    // E/(1+E), BEFORE the normal renderer (or CCTV OutputPass) applies ACES.
    return c / max(vec3(1.) - c, vec3(.015625));
  }
`;
export const VILLA_MIRROR_FRAGMENT = /* glsl */`
  vec3 mirrorOffset = -vViewPosition * mat3(viewMatrix);
  vec3 mirrorI = normalize(mirrorOffset);
  vec3 mirrorN = transformNormalByInverseViewMatrix(normal, viewMatrix);
  vec3 mirrorR = reflect(mirrorI, mirrorN);
  // Only the silver face. The thin bevel/back and the reverse side seen from
  // the next room never acquire that room's interior photograph.
  if (dot(mirrorI, villaMirrorAxis) < 0. && dot(mirrorN, villaMirrorAxis) > .7
      && dot(mirrorR, villaMirrorAxis) > 0.) {
    vec2 mirrorUV = villaRoomUV(cameraPosition + mirrorOffset, mirrorR);
    vec3 reflectedRoom = vec3(0.);
    if (villaMirrorWeights.x > 0.) reflectedRoom += villaMirrorWeights.x * villaRoomRadiance(mirrorUV, 0.);
    if (villaMirrorWeights.y > 0.) reflectedRoom += villaMirrorWeights.y * villaRoomRadiance(mirrorUV, 1.);
    if (villaMirrorWeights.z > 0.) reflectedRoom += villaMirrorWeights.z * villaRoomRadiance(mirrorUV, 2.);
    if (villaMirrorWeights.w > 0.) reflectedRoom += villaMirrorWeights.w * villaRoomRadiance(mirrorUV, 3.);
    outgoingLight = .014 * outgoingLight + vec3(.927,.953,.941) * reflectedRoom;
  }
`;
