import { View, type ViewProps } from "react-native";
export function SafeAreaView({ edges: _, ...props }: ViewProps & { edges?: string[] }) {
  return <View {...props} />;
}
