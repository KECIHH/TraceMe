"use client";

export function DocumentDownloadLink({
  children,
  className,
  href,
  isSensitive,
}: {
  children: React.ReactNode;
  className: string;
  href: string;
  isSensitive: boolean;
}) {
  return (
    <a
      className={className}
      href={href}
      onClick={(event) => {
        if (
          isSensitive &&
          !window.confirm(
            "此文件可能包含证件、订单、保险等隐私信息，确定要下载吗？",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </a>
  );
}
