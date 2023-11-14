# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

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
