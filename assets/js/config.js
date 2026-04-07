export async function loadAppConfig() {
  const response = await fetch("assets/data/app-config.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load app configuration.");
  }
  return response.json();
}
