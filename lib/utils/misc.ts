export async function try_prom<T>(prom: Promise<T>): Promise<T | undefined> {
	try {
		return await prom;
	} catch {
		return undefined;
	}
}
