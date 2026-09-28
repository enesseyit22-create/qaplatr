export type PinPoint = { id: string; lat: number; lng: number };

export type PinGroup = {
  id: string;
  lat: number;
  lng: number;
  members: PinPoint[];
  spread: PinPoint[];
};

function cellSizeMeters(zoom: number) {
  if (zoom >= 16.6) return 14;
  if (zoom >= 15.6) return 28;
  if (zoom >= 14.4) return 64;
  if (zoom >= 12.8) return 120;
  return 220;
}

function cellKey(lat: number, lng: number, sizeM: number) {
  const latM = 111_320;
  const lngM = Math.max(20_000, Math.cos((lat * Math.PI) / 180) * 111_320);
  const y = Math.round((lat * latM) / sizeM);
  const x = Math.round((lng * lngM) / sizeM);
  return `${x}:${y}`;
}

function spiderfy(members: PinPoint[], lat: number, lng: number): PinPoint[] {
  if (members.length === 1) return [{ ...members[0], lat, lng }];
  const radius = 0.00016 + Math.min(members.length, 10) * 0.000018;
  return members.map((member, index) => {
    const angle = ((Math.PI * 2) * index) / members.length - Math.PI / 2;
    return {
      id: member.id,
      lat: lat + radius * Math.cos(angle),
      lng: lng + (radius * Math.sin(angle)) / Math.max(0.45, Math.cos((lat * Math.PI) / 180)),
    };
  });
}

export function groupPins(points: PinPoint[], zoom: number): PinGroup[] {
  const size = cellSizeMeters(zoom);
  const buckets = new Map<string, PinPoint[]>();
  for (const point of points) {
    const key = cellKey(point.lat, point.lng, size);
    const list = buckets.get(key);
    if (list) list.push(point);
    else buckets.set(key, [point]);
  }
  const groups: PinGroup[] = [];
  for (const [id, members] of buckets) {
    const lat = members.reduce((sum, item) => sum + item.lat, 0) / members.length;
    const lng = members.reduce((sum, item) => sum + item.lng, 0) / members.length;
    groups.push({
      id,
      lat,
      lng,
      members,
      spread: spiderfy(members, lat, lng),
    });
  }
  return groups;
}

export function shouldCluster(group: PinGroup, zoom: number) {
  return group.members.length > 1 && zoom < 14.2;
}
