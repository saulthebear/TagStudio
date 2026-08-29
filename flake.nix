{
  description = "TagStudio Web and API development environment";

  inputs = {
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = import inputs.systems;

      perSystem =
        { pkgs, ... }:
        {
          devShells.default = pkgs.mkShellNoCC {
            packages = with pkgs; [
              bun
              ffmpeg-headless
              python312
              ripgrep
              uv
            ];

            env.UV_PYTHON_DOWNLOADS = "never";
          };

          formatter = pkgs.nixfmt-rfc-style;
        };
    };
}
