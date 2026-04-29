declare module "react-native" {
  export const Platform: {
    OS: "android" | "ios" | "macos" | "web" | "windows" | (string & {});
  };
}

declare module "react-native/Libraries/NativeModules/specs/NativeSourceCode" {
  const NativeSourceCode: {
    getConstants(): { scriptURL?: string };
  };
  export default NativeSourceCode;
}
