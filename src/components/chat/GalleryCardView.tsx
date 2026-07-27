import React, { useEffect, useState } from 'react';
import type { GalleryCard, GalleryItem } from '../../types';
import * as Stores from '../../db/stores';

interface Props { card: GalleryCard; isDark: boolean; }

function GalleryMedia({ item, isDark }: { item: GalleryItem; isDark: boolean }) {
  const [src, setSrc] = useState(item.source === 'remote' ? (item.url || '') : '');
  const [loading, setLoading] = useState(Boolean(item.url || item.assetId));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false); setLoading(true);
    if (item.source === 'local' && item.assetId) {
      void Stores.getImageAssetObjectUrl(item.assetId).then((url) => {
        if (active) { setSrc(url || ''); if (!url) setFailed(true); }
      });
    } else {
      setSrc(item.url || '');
      if (!item.url) setFailed(true);
    }
    return () => { active = false; };
  }, [item.assetId, item.source, item.url]);

  const link = item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 text-[10px] underline opacity-80">打开原链接</a>;
  if (failed) return <div className={"min-w-44 min-h-28 max-w-60 flex flex-col items-center justify-center rounded-lg px-3 text-xs text-center " + (isDark ? 'bg-[#222] text-[#999]' : 'bg-[#f3f3f3] text-[#999]')}>媒体暂时无法显示{link}</div>;
  if (!src) return <div className={"min-w-44 min-h-28 max-w-60 flex items-center justify-center rounded-lg text-xs " + (isDark ? 'bg-[#222] text-[#888]' : 'bg-[#f3f3f3] text-[#999]')}>媒体加载中…</div>;
  if (item.type === 'video') {
    return <video src={src} controls playsInline preload="metadata" className="block w-full h-auto max-w-full rounded-lg bg-black object-contain" onLoadedMetadata={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} />;
  }
  return <img src={src} alt={item.title || ''} className="block w-full max-w-full h-auto rounded-lg object-contain" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} />;
}

export function GalleryCardView({ card, isDark }: Props) {
  const text = isDark ? 'text-[#e0e0e0]' : 'text-[#222]';
  const muted = isDark ? 'text-[#999]' : 'text-[#777]';
  const titleStyle = { textAlign: 'left' as const };
  const mediaTextStyle = { textAlign: 'center' as const, fontWeight: card.mediaTextBold ? 700 : 400 };
  const stacked = card.layout === 'stacked' && !card.items.some((item) => item.type === 'video');
  const rows = stacked
    ? (card.rows?.length ? card.rows : [{ id: 'legacy-row', title: '', itemIds: card.items.map((item) => item.id) }])
    : [{ id: 'carousel-row', title: '', itemIds: card.items.map((item) => item.id) }];
  const itemMap = new Map(card.items.map((item) => [item.id, item]));
  const itemCaption = (item: GalleryItem) => (item.title || item.caption) && <div className={"max-w-full mt-1 text-[10px] leading-4 " + muted} style={mediaTextStyle}>
    {item.title && <div className="truncate">{item.title}</div>}
    {item.caption && <div className="whitespace-pre-wrap">{item.caption}</div>}
  </div>;
  return (
    <div className={"max-w-[min(90vw,560px)] rounded-xl border p-3 shadow-sm " + (isDark ? 'bg-[#202020] border-[#3a3a3a]' : 'bg-white border-[#e2e2e2')}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          {!card.hideTitle && <h3 className={"text-sm truncate " + text} style={titleStyle}>{card.title || '图鉴'}</h3>}
          {card.description && <p className={"mt-1 text-xs whitespace-pre-wrap " + muted} style={titleStyle}>{card.description}</p>}
        </div>
        <span className={"text-[10px] whitespace-nowrap " + muted}>{card.items.length} 项</span>
      </div>
      <div className={stacked ? 'space-y-4 pb-1' : 'flex items-start gap-3 overflow-x-auto snap-x snap-mandatory pb-1'}>
        {card.items.length === 0 && <div className={"text-xs py-6 " + muted}>暂无媒体</div>}
        {rows.map((row) => {
          const rowItems = row.itemIds.map((id) => itemMap.get(id)).filter((item): item is GalleryItem => Boolean(item));
          return <section key={row.id} className={stacked ? 'min-w-0' : 'contents'}>
            {stacked && row.title && <h4 className={'text-xs mb-1 ' + text} style={titleStyle}>{row.title}</h4>}
            <div className={stacked ? 'flex items-start gap-3 overflow-x-auto snap-x snap-mandatory pb-1' : 'contents'}>
              {rowItems.map((item) => (
                <div key={item.id} className="flex-shrink-0 snap-start w-60 max-w-full">
                  <GalleryMedia item={item} isDark={isDark} />
                  {itemCaption(item)}
                </div>
              ))}
            </div>
          </section>;
        })}
      </div>
    </div>
  );
}
