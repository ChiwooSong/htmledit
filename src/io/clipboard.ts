// Start the write during the click gesture (required by Safari), but only
// provide data after saving and checking that the document has not changed.
export async function copyWhenReady(prepare: () => Promise<string | null>) {
  const prepared = prepare();
  let write: Promise<void>;
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const data = prepared.then((text) => {
      if (text === null) throw new Error('Copy cancelled');
      return new Blob([text], { type: 'text/plain' });
    });
    // Some browsers reject before consuming the item's data (permissions).
    // Observe its rejection too, including when the save later fails.
    void data.catch(() => {});
    try {
      write = navigator.clipboard.write([new ClipboardItem({ 'text/plain': data })]);
    } catch (error) {
      write = Promise.reject(error);
    }
  } else {
    write = prepared.then((text) =>
      text === null ? undefined : navigator.clipboard.writeText(text),
    );
  }
  const written = write.then(
    () => true,
    () => false,
  );
  if ((await prepared) === null) return false;
  if (!(await written)) throw new Error('Clipboard unavailable');
  return true;
}
