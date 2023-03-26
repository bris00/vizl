{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay, }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };
        
        darwinDeps = with pkgs; if stdenv.hostPlatform.isDarwin then [
          darwin.apple_sdk.frameworks.Security
        ] else [];
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Select nix environment
            nix-direnv

            # Nix
            rnix-lsp
            nixpkgs-fmt

            # Node
            yarn
          ] ++ darwinDeps;
        };
      });
}
