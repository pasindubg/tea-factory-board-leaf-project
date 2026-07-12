import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Tea Factory Ops",
  description: "Green leaf intake, suppliers and payments for bought-leaf tea factories",
};

const progressiveEnhancementScript = `(function(){
  if(window.__listSearchFallbackInstalled)return;
  window.__listSearchFallbackInstalled=true;
  document.addEventListener('click',function(event){
    var dismiss=event.target instanceof Element&&event.target.closest('[data-list-search-dismiss]');
    if(dismiss){
      var dismissPanel=dismiss.closest('[data-list-search-panel]');
      var dismissDetails=dismissPanel&&dismissPanel.querySelector('details[open]');
      if(dismissDetails)dismissDetails.removeAttribute('open');
      return;
    }
    var selectAll=event.target instanceof HTMLInputElement&&event.target.matches('[data-select-all]')?event.target:null;
    if(selectAll){
      var key=selectAll.getAttribute('data-select-all');
      var form=selectAll.closest('form');
      if(form)form.querySelectorAll('[data-select-row="'+key+'"]').forEach(function(box){if(!box.closest('tr')?.hidden)box.checked=selectAll.checked;});
      return;
    }
    var button=event.target instanceof Element&&event.target.closest('[data-list-search-apply]');
    if(!button)return;
    var hydrated=Object.keys(button).some(function(key){return key.indexOf('__react')===0;});
    if(hydrated)return;
    var panel=button.closest('[data-list-search-panel]');
    var surface=panel&&panel.parentElement;
    if(!surface)return;
    var needles=Array.from(panel.querySelectorAll('[data-list-lov]')).map(function(select){return select.value.trim().toLocaleLowerCase();}).filter(Boolean);
    surface.querySelectorAll('tbody tr').forEach(function(row){
      var text=(row.textContent||'').toLocaleLowerCase();
      row.hidden=!needles.every(function(needle){return text.includes(needle);});
    });
    var disclosure=button.closest('details');
    if(disclosure)disclosure.removeAttribute('open');
  });
})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const storedTheme = (await cookies()).get("app-theme")?.value;
  const forcedTheme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : undefined;
  return (
    <html lang="en" className={forcedTheme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <Script id="dashboard-progressive-enhancement" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: progressiveEnhancementScript }} />
      </head>
      <body className="min-h-screen antialiased transition-colors">
        <Providers forcedTheme={forcedTheme}>{children}</Providers>
      </body>
    </html>
  );
}
