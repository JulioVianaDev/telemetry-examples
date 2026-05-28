i stay trying create one full dashboard for one fullstack project with telemetry, i trying add into the @backend\ one
full step project, how i want this?i want example, when i make get cache using my @backend/src/redis\ in redis
service to cache the get message and not hit the postgresql to be more faster, and i want see inside the
@backend/src/tracing.ts can traces for redis and elastic search like i have in postgresql, like i see inside the
grafana trace the FULL usage and queries etc of postgresql instrumetration, and please register in
@backend/src/elasticsearch\ using like @backend/src/elasticsearch/README.md one repository to injest into elastic
one log example "message created" "message deleted" "message updated" etc and can get logs by term in get to see if
find there, because i want see elastic search and redis into the tracings of grafana too,

second item is, i trying add images obervability like how much cpu usage storage, network and other things, and extra
informations in posgtresql redis, rabiitmq, elastic search like how much clients are conneted based on time etc,
please validate this too for others dashboards,

and i want see how much websockets are plugged by my redis socket too, like if i have 100 websockets conneted

and please fix this cadvisor erros because they cant found any things:

| E0528 17:36:17.784420 1 manager.go:1116] Failed to create existing container: /docker/be737dcfcfa88c0da53fc4821d761c0d0cfa51cac69291de53ba68ab9731af9f: failed to identify the read-write layer ID for container "be737dcfcfa88c0da53fc4821d761c0d0cfa51cac69291de53ba68ab9731af9f". - open /var/lib/docker/image/overlayfs/layerdb/mounts/be737dcfcfa88c0da53fc4821d761c0d0cfa51cac69291de53ba68ab9731af9f/mount-id: no such file or directory
cadvisor | E0528 17:36:17.836505 1 manager.go:1116] Failed to create existing container: /docker/34d2c0e8e9696eef24f02461c411ffb6134e8551f38858548a3d6518d43cba88: failed to identify the read-write layer ID for container "34d2c0e8e9696eef24f02461c411ffb6134e8551f38858548a3d6518d43cba88". - open /var/lib/docker/image/overlayfs/layerdb/mounts/34d2c0e8e9696eef24f02461c411ffb6134e8551f38858548a3d6518d43cba88/mount-id: no such file or directory
cadvisor | E0528 17:36:17.918117 1 manager.go:1116] Failed to create existing container: /docker/c7baeefc8f601d9ab64d61fea27332a51021ba5c38d4cc6e9fb44d3ded06c4b2: failed to identify the read-write layer ID for container "c7baeefc8f601d9ab64d61fea27332a51021ba5c38d4cc6e9fb44d3ded06c4b2". - open /var/lib/docker/image/overlayfs/layerdb/mounts/c7baeefc8f601d9ab64d61fea27332a51021ba5c38d4cc6e9fb44d3ded06c4b2/mount-id: no such file or directory
cadvisor | E0528 17:36:17.980769 1 manager.go:1116] Failed to create existing container: /docker/e3d90a5b8bb2c7a38572576d48e9b1f051de560d35bed09fdad07b8e3557fb23: failed to identify the read-write layer ID for container "e3d90a5b8bb2c7a38572576d48e9b1f051de560d35bed09fdad07b8e3557fb23". - open /var/lib/docker/image/overlayfs/layerdb/mounts/e3d90a5b8bb2c7a38572576d48e9b1f051de560d35bed09fdad07b8e3557fb23/mount-id: no such file or directory
cadvisor | E0528 17:36:18.040981 1 manager.go:1116] Failed to create existing container: /docker/44ff322e220b94f626a5292497d70f8097d17763a3af2d1f55afa6c47abe263f: failed to identify the read-write layer ID for container "44ff322e220b94f626a5292497d70f8097d17763a3af2d1f55afa6c47abe263f". - open /var/lib/docker/image/overlayfs/layerdb/mounts/44ff322e220b94f626a5292497d70f8097d17763a3af2d1f55afa6c47abe263f/mount-id: no such file or directory
cadvisor | E0528 17:36:18.091973 1 manager.go:1116] Failed to create existing container: /docker/0ef22405aab5dbcb4de7a7fe7dbe77e24eb98a9b88bc4abe052283e3f39f9e07: failed to identify the read-write layer ID for container "0ef22405aab5dbcb4de7a7fe7dbe77e24eb98a9b88bc4abe052283e3f39f9e07". - open /var/lib/docker/image/overlayfs/layerdb/mounts/0ef22405aab5dbcb4de7a7fe7dbe77e24eb98a9b88bc4abe052283e3f39f9e07/mount-id: no such file or directory
cadvisor | E0528 17:36:18.228403 1 manager.go:1116] Failed to create existing container: /docker/10746c3ec7a2e47a5e97d245ca452812708c4748b6b86fa12dac3640a5b5d87d: failed to identify the read-write layer ID for container "10746c3ec7a2e47a5e97d245ca452812708c4748b6b86fa12dac3640a5b5d87d". - open /var/lib/docker/image/overlayfs/layerdb/mounts/10746c3ec7a2e47a5e97d245ca452812708c4748b6b86fa12dac3640a5b5d87d/mount-id: no such file or directory
grafana | logger=provisioning.dashboard t=2026-05-28T17:36:19.302642689Z level=info msg="finished to provision dashboards"
