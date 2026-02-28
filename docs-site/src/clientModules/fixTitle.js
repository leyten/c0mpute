if (typeof window !== 'undefined') {
  const observer = new MutationObserver(() => {
    if (document.title !== 'c0mpute — docs') {
      document.title = 'c0mpute — docs';
    }
  });
  observer.observe(document.querySelector('title') || document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  document.title = 'c0mpute — docs';
}
