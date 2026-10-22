// The hosted preview has no phone relay. Desktop ownership stays browser-local.
export const webcamOnly = import.meta.env.MODE === 'hosted';
export async function getSession(): Promise<{token:string;phoneUrl?:string}> {
  if (webcamOnly) return {token:''};
  const response = await fetch('/api/session');
  if (!response.ok) throw Error('Could not connect to the local studio server.');
  return response.json();
}
