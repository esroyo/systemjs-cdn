# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.11.0](https://github.com/esroyo/systemjs.sh/compare/v1.10.2...v1.11.0) (2024-02-03)


### Features

* enable usage of rollup@4 ([93cb4ea](https://github.com/esroyo/systemjs.sh/commit/93cb4ea652398cfa41d7b9d7513d329d9ac31b4c))

## [1.10.2](https://github.com/esroyo/systemjs.sh/compare/v1.10.1...v1.10.2) (2024-02-02)


### Bug Fixes

* cache is partitioned by target/user-agent ([9baa3ad](https://github.com/esroyo/systemjs.sh/commit/9baa3ad75cf081e4de1f76ea1483e5ef79d67bce))

## [1.10.1](https://github.com/esroyo/systemjs.sh/compare/v1.10.0...v1.10.1) (2024-02-01)


### Bug Fixes

* make sure BASE_PATH is honored on URL without origin (absolute paths) on dyn imports ([3e3093a](https://github.com/esroyo/systemjs.sh/commit/3e3093ab2272f8e677299da7a09f26ee8f9d81a5))

## [1.10.0](https://github.com/esroyo/systemjs.sh/compare/v1.9.3...v1.10.0) (2024-01-31)


### Features

* enable/disable cache with env var CACHE_MAXAGE ([7336a4d](https://github.com/esroyo/systemjs.sh/commit/7336a4dfe785da5bbae7e737feff93b47265208f))

## [1.9.3](https://github.com/esroyo/systemjs.sh/compare/v1.9.2...v1.9.3) (2024-01-31)


### Bug Fixes

* add header "access-control-allow-origin" is not exists ([4d49deb](https://github.com/esroyo/systemjs.sh/commit/4d49debf8194074e507a0f73632adf7a3cabc9d3))

## [1.9.2](https://github.com/esroyo/systemjs.sh/compare/v1.9.1...v1.9.2) (2024-01-31)


### Bug Fixes

* make sure BASE_PATH is honored on URL without origin (absolute paths) ([8c67c6f](https://github.com/esroyo/systemjs.sh/commit/8c67c6f0473450d55ffb86f58b0add3584691746))

## [1.9.1](https://github.com/esroyo/systemjs.sh/compare/v1.9.0...v1.9.1) (2024-01-31)


### Bug Fixes

* avoid Worker recursion ([e8be08b](https://github.com/esroyo/systemjs.sh/commit/e8be08b8f1fff4308b6c244c57afa533770f59bc))
* enable cache on larger modules ([0b15505](https://github.com/esroyo/systemjs.sh/commit/0b1550526ae776d573680636a09a49e4a7b814b1))

## [1.9.0](https://github.com/esroyo/systemjs.sh/compare/v1.8.1...v1.9.0) (2024-01-31)


### Features

* do code transpilation on worker if possible ([380000f](https://github.com/esroyo/systemjs.sh/commit/380000fedd52c400cc9ab0af759a57b804eb21a9))

## [1.8.1](https://github.com/esroyo/systemjs.sh/compare/v1.8.0...v1.8.1) (2024-01-31)


### Bug Fixes

* handle kv set errors ([14ab7ca](https://github.com/esroyo/systemjs.sh/commit/14ab7ca9c750a463c9f005b38460b733b927aaab))

## [1.8.0](https://github.com/esroyo/systemjs.sh/compare/v1.7.3...v1.8.0) (2024-01-31)


### Features

* implement a simple cache using Kv ([eb4b2e5](https://github.com/esroyo/systemjs.sh/commit/eb4b2e5d565b7163daf5bc0d237335f5d2d0c0ef))

## [1.7.3](https://github.com/esroyo/systemjs.sh/compare/v1.7.2...v1.7.3) (2024-01-30)


### Bug Fixes

* prevent some headers propagation ([53f49f6](https://github.com/esroyo/systemjs.sh/commit/53f49f6683a30764583bcfd7b2e2663b39386de4))

## [1.7.2](https://github.com/esroyo/systemjs.sh/compare/v1.7.1...v1.7.2) (2023-11-24)

## [1.7.1](https://github.com/esroyo/systemjs.sh/compare/v1.7.0...v1.7.1) (2023-11-21)


### Bug Fixes

* ensure custom `X-` headers are not passed to ESM upstream ([da75efd](https://github.com/esroyo/systemjs.sh/commit/da75efdb367d9a015b08122804cbdd08c92d0a68))

## [1.7.0](https://github.com/esroyo/systemjs.sh/compare/v1.6.1...v1.7.0) (2023-11-21)


### Features

* add more debug on final stage ([b480c7d](https://github.com/esroyo/systemjs.sh/commit/b480c7dee035210d9c10b00a98470ba72fbb89df))

## [1.6.1](https://github.com/esroyo/systemjs.sh/compare/v1.6.0...v1.6.1) (2023-11-21)


### Bug Fixes

* handles different hosts on actual request and X-Real-Origin ([3dfc18b](https://github.com/esroyo/systemjs.sh/commit/3dfc18b87a7d9cb50a3fc2083eb780cc737c3936))

## [1.6.0](https://github.com/esroyo/systemjs.sh/compare/v1.5.0...v1.6.0) (2023-11-20)


### Features

* allow to return debug info using `X-Debug` header ([972ac79](https://github.com/esroyo/systemjs.sh/commit/972ac790364dee2824773210c27c6c0c97b4aab5))

## [1.5.0](https://github.com/esroyo/systemjs.sh/compare/v1.4.0...v1.5.0) (2023-11-16)


### Features

* add response `X-Debug-Performance` info ([00586fe](https://github.com/esroyo/systemjs.sh/commit/00586feb58a93b4a0a20fa4c67d5c82c554e461c))

## [1.4.0](https://github.com/esroyo/systemjs.sh/compare/v1.3.1...v1.4.0) (2023-11-16)


### Features

* add repsonse `X-Real-Origin` debug header ([3db9860](https://github.com/esroyo/systemjs.sh/commit/3db9860f25ccaa456aa68e19ef5d0d25ba9f9920))

## [1.3.1](https://github.com/esroyo/systemjs.sh/compare/v1.3.0...v1.3.1) (2023-11-16)


### Bug Fixes

* use X-Real-Origin after homepage redirect discard ([15d26e6](https://github.com/esroyo/systemjs.sh/commit/15d26e62a7e6c9561b8a853eb22a831e2b9dff7e))

## [1.3.0](https://github.com/esroyo/systemjs.sh/compare/v1.2.0...v1.3.0) (2023-11-15)


### Features

* enable option to detect redirections (curl, node, none) ([cae206b](https://github.com/esroyo/systemjs.sh/commit/cae206be0814ed163af49a841e0ed34d9ef49507))

## [1.2.0](https://github.com/esroyo/systemjs.sh/compare/v1.1.1...v1.2.0) (2023-11-14)


### Features

* request may use `X-Real-Origin` header as origin ([0940f91](https://github.com/esroyo/systemjs.sh/commit/0940f910f2b1cc5d6046b163dc1eb544a3264b70))

## [1.1.1](https://github.com/esroyo/systemjs.sh/compare/v1.1.0...v1.1.1) (2023-11-14)

## 1.1.0 (2023-11-14)


### Features

* add new env option for rollup `output.banner` ([2f0017c](https://github.com/esroyo/systemjs.sh/commit/2f0017c22172c0b4c550e7c1d943fee86ccbdc26))
* add support for config BASE_PATH ([7784483](https://github.com/esroyo/systemjs.sh/commit/77844833c9c43097dfe87fd654ffbbceb6afd61b))
* proxy request to esm.sh and convert to systemjs ([6895382](https://github.com/esroyo/systemjs.sh/commit/6895382dabb069901df4444cbc1f01a7934bee7e))
* redirect to ESM_SERVICE_HOST if request empty ([848f62d](https://github.com/esroyo/systemjs.sh/commit/848f62d9c206480b8a2cc3dc3320035f63b3f4c5))


### Bug Fixes

* add error log ([7e3820c](https://github.com/esroyo/systemjs.sh/commit/7e3820caf70f1c278e47b0c5f7b17670275203d2))
* avoid permission denied on Dockerfile build ([aaa75bb](https://github.com/esroyo/systemjs.sh/commit/aaa75bb697f2aefaff2528cce2073a190db9134c))
* forward response headers from ESM_SERVICE_HOST to client ([fcd0abf](https://github.com/esroyo/systemjs.sh/commit/fcd0abf916ce5f0e12689d36e9bbb98111e0751d))
* replace URLs on the response to self hostname ([6823b3d](https://github.com/esroyo/systemjs.sh/commit/6823b3d1681c249d47fa3b32c47a84358693d869))
* typo on header name ([3f43114](https://github.com/esroyo/systemjs.sh/commit/3f431142d3fc0272cc28f4d6dbc2a7cac4e6865b))
* will forward the request to esm.sh keeping parameters ([522f301](https://github.com/esroyo/systemjs.sh/commit/522f3011ee2189e19759410ed923f618d09e597b))
