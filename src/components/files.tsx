import type { OrderFile } from '@/lib/db/schema';
import { KIND_LABEL } from '@/lib/labels';
import { dayTime } from '@/lib/format';

/** Every uploaded file as a thumbnail grid, newest last; opens full size in a new tab. */
export function FileThumbs({ files }: { files: OrderFile[] }) {
  if (!files.length) return null;
  return (
    <div className="thumbs">
      {files.map((f) => (
        <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" title={`${KIND_LABEL[f.kind]} · ${dayTime(f.createdAt)}`}>
          {f.mime.startsWith('image/') ? <img src={`/api/files/${f.id}`} alt={KIND_LABEL[f.kind]} loading="lazy" /> : <span className="pdf">PDF</span>}
          <span>{KIND_LABEL[f.kind].split(' ')[0]}</span>
        </a>
      ))}
    </div>
  );
}
