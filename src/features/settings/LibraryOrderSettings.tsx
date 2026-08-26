import { ArrowDown, ArrowUp } from "lucide-react";
import type { LibraryNavigationId } from "../../types";

export type OrderedLibrary = { id: LibraryNavigationId; label: string };

export function LibraryOrderSettings({ libraries, onChange }: { libraries: OrderedLibrary[]; onChange: (order: LibraryNavigationId[]) => void }) {
  const move = (index: number, direction: -1 | 1) => {
    const next = [...libraries];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map(item => item.id));
  };
  return <div className="settings-card"><h3>Sidebar library order</h3><p>Choose the order of Movies, TV, Specials, and collection sources.</p><div className="library-order-list">{libraries.map((library, index) => <div key={library.id} className="library-order-row"><span>{library.label}</span><button aria-label={`Move ${library.label} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15}/></button><button aria-label={`Move ${library.label} down`} disabled={index === libraries.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15}/></button></div>)}</div></div>;
}
