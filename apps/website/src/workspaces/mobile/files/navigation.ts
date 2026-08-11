import AsyncStorage from "@react-native-async-storage/async-storage";

export const routes = {
  home: "Home",
};

export async function loadCachedProfile(): Promise<{ name: string } | null> {
  const raw = await AsyncStorage.getItem("profile");
  return raw ? JSON.parse(raw) : null;
}
