const DESKTOP_SIDEBAR_STORAGE_KEY = 'cg-sidebar-collapsed-desktop-v2';

export function initializeSidebar() {
  const toggle = document.getElementById('sidebarToggle');
  const brandToggle = document.getElementById('sidebarToggleBtn');
  const body = document.body;

  const setCollapsed = (collapsed: boolean) => {
    body.classList.toggle('sidebar-collapsed', collapsed);
    toggle?.setAttribute('aria-expanded', String(!collapsed));
    brandToggle?.setAttribute('aria-expanded', String(!collapsed));
    const collapseIcon = brandToggle?.querySelector<HTMLElement>('.icon-collapse');
    const expandIcon = brandToggle?.querySelector<HTMLElement>('.icon-expand');
    if (collapseIcon) collapseIcon.style.display = collapsed ? 'none' : 'block';
    if (expandIcon) expandIcon.style.display = collapsed ? 'block' : 'none';
    try {
      if (window.innerWidth > 960) {
        localStorage.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
      }
    } catch {
      // Sidebar persistence is optional.
    }
  };

  const initialCollapsed = (() => {
    if (window.innerWidth <= 960) return true;
    try {
      const value = localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY);
      return value === null ? false : value === '1';
    } catch {
      return false;
    }
  })();

  const toggleCollapsed = () => setCollapsed(!body.classList.contains('sidebar-collapsed'));
  toggle?.addEventListener('click', toggleCollapsed);
  brandToggle?.addEventListener('click', toggleCollapsed);

  document.addEventListener('click', (event) => {
    if (window.innerWidth > 960) return;
    const aside = document.querySelector('.main-sidebar');
    const target = event.target;
    if (!aside || !(target instanceof Node)) return;
    const clickedToggle = toggle?.contains(target) ?? false;
    const clickedBrandToggle = brandToggle?.contains(target) ?? false;
    if (!body.classList.contains('sidebar-collapsed')
      && !aside.contains(target)
      && !clickedToggle
      && !clickedBrandToggle) {
      setCollapsed(true);
    }
  });

  setCollapsed(initialCollapsed);

  return {
    closeOnMobile: () => {
      if (window.innerWidth <= 960) setCollapsed(true);
    },
  };
}
