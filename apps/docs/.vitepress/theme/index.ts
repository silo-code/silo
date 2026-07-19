import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
// Live design-system component demos (scoped under .silo-demo).
import "./silo-demos.css";

export default {
  extends: DefaultTheme,
  Layout,
};
