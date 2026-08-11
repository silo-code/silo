import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "./HomeScreen";
import { routes } from "./navigation";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={routes.home}>
        <Stack.Screen name={routes.home} component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
