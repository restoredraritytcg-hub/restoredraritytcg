/* Shared chrome for static service pages: year and mobile nav. */
(function(){
  const year = document.getElementById('year');
  if(year) year.textContent = new Date().getFullYear();

  const nav = document.querySelector('.header-nav');
  const toggle = document.getElementById('nav-toggle');
  if(!nav) return;
  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    if(!toggle) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  if(toggle){
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && nav.classList.contains('is-open')){ setOpen(false); toggle.focus(); } });
    document.addEventListener('click', (e) => {
      if(!nav.classList.contains('is-open')) return;
      if(nav.contains(e.target) || toggle.contains(e.target)) return;
      setOpen(false);
    });
  }
})();
