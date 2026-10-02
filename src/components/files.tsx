import type { OrderFile } from '@/lib/db/schema';
import { ActButton } from './client';
import { KIND_LABEL } from '@/lib/labels';
import { dayTime } from '@/lib/format';

/** Every uploaded file as a thumbnail grid, newest last; opens full size in a new tab. */
/** With `remove`, each file gets a Remove button (asks first). */
export function FileThumbs({ files, remove }: { files: OrderFile[]; remove?: (fileId: string) => Promise<{ ok?: string; error?: string } | null> }) {
  if (!files.length) return null;
  return (
    <div className="thumbs">
      {files.map((f) => (
        <div key={f.id} className="thumb">
          <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" title={`${KIND_LABEL[f.kind]} · ${dayTime(f.createdAt)}`}>
            {f.mime.startsWith('image/') ? <img src={`/api/files/${f.id}`} alt={KIND_LABEL[f.kind]} loading="lazy" /> : <span className="pdf">PDF</span>}
            <span>{KIND_LABEL[f.kind].split(' ')[0]}</span>
          </a>
          {remove && <ActButton className="thumb-del" action={remove.bind(null, f.id)} confirm="Remove for good?">Remove</ActButton>}
        </div>
      ))}
    </div>
  );
}
