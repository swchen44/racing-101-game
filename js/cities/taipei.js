// Source axes are Y-up; every listed building facade faces local -Z.
export const vehicleIds = ['sedan', 'taxi', 'sports', 'suv'];
export const routeRevision = 'taipei-loop-v1';
export const placementSeed = 20261020;
export const zones = [
  { id: 'book-street', start: 0, end: .24 },
  { id: 'night-market', start: .24, end: .46 },
  { id: 'temple-square', start: .46, end: .72 },
  { id: 'commercial', start: .72, end: 1 },
];
export const trackDef = {
  id: 'taipei', cityId: 'taipei', routeRevision,
  name: '台北生活街區', nameEn: 'TAIPEI STREET CIRCUIT',
  desc: '穿越街屋、夜市、廟埕與商業街的封閉環道',
  descEn: 'Bookshops, market stalls and a temple square',
  intro: '從牯嶺街的書店起跑，沿夜市外緣轉進開闊廟埕，再穿過商業街回到起點。把台北街頭風景串成一圈的虛構賽道。',
  introEn: 'Race past bookshops and the night market, sweep around the temple square and accelerate through the shopping district. A fictional closed circuit assembled from Taipei source models.',
  tags: ['街屋夜市', '廟埕彎道', '都會街賽'], tagsEn: ['Night market', 'Temple square', 'Street racing'],
  difficulty: 2, lengthKm: 1.045,
  controlPoints: [
    [-170, -120], [-80, -130], [20, -128], [100, -115],
    [155, -75], [175, -5], [165, 65], [110, 110],
    [20, 125], [-75, 120], [-145, 90], [-175, 30], [-180, -55],
  ],
  theme: { cityId: 'taipei', landmark: 'none', sourceOnly: true, groundTint: 0x72736c,
    skyZenith: [.20, .42, .78], skyMid: [.52, .68, .88], horizonColor: [.78, .84, .92] },
};
export const placements = [
  { id: 'guling-book-street', s: .055, side: -1, clearance: 11.6 },
  { id: 'bolero-1934', s: .135, side: 1, clearance: 11.6 },
  { id: 'chensanding-pearl-milk', s: .185, side: -1, clearance: 11.6 },
  { id: 'linjiang-market', s: .300, side: -1, clearance: 14.6 },
  { id: 'fongda-coffee', s: .375, side: 1, clearance: 14.6 },
  { id: 'cisheng-temple', s: .545, side: -1, clearance: 16.6 },
  { id: 'regent-hotel', s: .730, side: -1, clearance: 24.6 },
  { id: 'donqi-ximen', s: .790, side: -1, clearance: 14.6 },
  { id: 'breezy-center', s: .875, side: -1, clearance: 16.6 },
];
export const shopIds = ['zhangxiexing-tea', 'linhefa-oil-rice', 'liting-bakery',
  'shuanglian-sweet-soup', 'jinfeng-lurou', 'longmen-pepper-bun', 'goose-mama-noodles', 'dazhi-douhua'];

// The temple is a foreground landmark inside a bounded urban square, not an
// isolated object in a 270m empty plane. Keep its outer foreground unobstructed.
export const templeEdges = [
  ...[.472, .500, .532, .564, .596, .628, .660, .692].map((s, index) => ({
    id: shopIds[index % shopIds.length], s, side: 1, clearance: 39, layer: 'garden-background',
  })),
  ...[.470, .490, .610, .632, .654, .676, .698].map((s, index) => ({
    id: shopIds[(index + 2) % shopIds.length], s, side: -1, clearance: 13.2, layer: 'square-edge',
  })),
  // A continuous low outer district closes the visible ground-plane horizon.
  // All remain below the temple's roof height; no new tower competes with it.
  ...Array.from({ length: 22 }, (_, index) => ({
    id: ['linhefa-oil-rice', 'liting-bakery', 'shuanglian-sweet-soup',
      'dazhi-douhua', 'goose-mama-noodles', 'chensanding-pearl-milk', 'longmen-pepper-bun'][index % 7],
    s: .450 + index * .0125, side: -1, clearance: 78, layer: 'temple-background',
  })),
];

// Retail forecourts deliberately use a different palette of complete source
// buildings. Embedded crowd meshes have no semantic source parts to remove.
export const commercialPlacements = [
  { id: 'chensanding-pearl-milk', s: .755, side: 1, clearance: 18.2 },
  { id: 'fongda-coffee', s: .785, side: 1, clearance: 18.2 },
  { id: 'donqi-ximen', s: .845, side: 1, clearance: 19.2 },
  { id: 'chensanding-pearl-milk', s: .900, side: 1, clearance: 19.2 },
  { id: 'breezy-center', s: .947, side: 1, clearance: 21.2 },
  { id: 'fongda-coffee', s: .925, side: -1, clearance: 16.2 },
  { id: 'chensanding-pearl-milk', s: .975, side: -1, clearance: 15.2 },
];
