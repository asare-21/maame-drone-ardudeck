/**
 * Header badge for a Maame multi-link connection: one pill per link (best
 * first), the active one outlined. Renders nothing for other connections.
 */
import { useConnectionStore } from '../stores/connection-store';

export function MaameLinkBadge() {
  const links = useConnectionStore((s) => s.connectionState.maameLinks);
  if (!links?.length) return null;
  return (
    <div className="flex items-center gap-1" role="status" aria-label="Maame links">
      {links.map((l) => {
        const state = !l.open ? 'closed, retrying' : l.alive ? 'alive' : 'silent';
        const ago = l.lastRxAgoMs === null ? 'no data yet' : `last data ${(l.lastRxAgoMs / 1000).toFixed(1)} s ago`;
        return (
          <span
            key={l.name}
            title={`${l.name}: ${state}${l.active ? ', in use' : ''} (${ago})`}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${l.active ? 'ring-1 ring-current' : 'opacity-70'} ${
              l.alive ? 'text-green-400' : 'text-gray-400'
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${l.alive ? 'bg-green-400' : l.open ? 'bg-gray-500' : 'bg-red-500'}`} />
            {l.name}
          </span>
        );
      })}
    </div>
  );
}
