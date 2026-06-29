type MemoDownloadLinkProps = {
  href: string;
  filename?: string;
};

export function MemoDownloadLink({ href, filename }: MemoDownloadLinkProps) {
  return (
    <a
      href={href}
      download={filename}
      className="memo-download-link inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
    >
      <span className="memo-download-link__rail memo-download-link__rail--top" aria-hidden="true" />
      <span
        className="memo-download-link__rail memo-download-link__rail--bottom"
        aria-hidden="true"
      />
      <span className="relative z-10">Download memo</span>
    </a>
  );
}
