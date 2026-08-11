import { useEffect, useState } from "react";
import { SafeAreaView, Text } from "react-native";
import { loadCachedProfile } from "./navigation";

export function HomeScreen() {
  const [profile, setProfile] = useState<{ name: string } | null>(null);

  useEffect(() => {
    // Guard against a null cache on first-ever launch — this was the crash.
    loadCachedProfile().then((cached) => setProfile(cached ?? null));
  }, []);

  return (
    <SafeAreaView>
      <Text>Welcome{profile ? `, ${profile.name}` : ""}</Text>
    </SafeAreaView>
  );
}
