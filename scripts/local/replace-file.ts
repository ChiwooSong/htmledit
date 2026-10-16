import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Windows readers/scanners can briefly deny replacement. Never unlink the
// destination: keep the atomic rename and revalidate after every wait.
export async function replaceFile(
  source: string,
  destination: string,
  validate: () => Promise<void>,
) {
  const waits = [25, 50, 100, 200, 400];
  for (let attempt = 0; ; attempt++) {
    await validate();
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (
        attempt >= waits.length ||
        !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')
      )
        throw error;
      await delay(waits[attempt]);
    }
  }
}
