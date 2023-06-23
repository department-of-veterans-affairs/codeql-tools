.PHONY: build
build: build-collect-metrics

.PHONY: build-collect-metrics
build-configure-codeql:
	echo "Building configure-codeql"
	go build -o bin/collect-metrics ./collect-metrics/cmd

.PHONY: docker
docker: docker-build docker-push

.PHONY: docker-build
docker-build: docker-build-collect-metrics

.PHONY: docker-push
docker-push: docker-push-collect-metrics

.PHONY: docker-run
docker-run: docker-run-collect-metrics

# Configure CodeQL
.PHONY: docker-build-collect-metrics
docker-build-collect-metrics:
	echo "Building docker image for configure-codeql"
	docker build -t ghcr.io/department-of-veterans-affairs/codeql-tools:collect-metrics -f collect-metrics/Dockerfile .

.PHONY: docker-push-collect-metrics
docker-push-collect-metrics:
	echo "Pushing docker image for configure-codeql"
	docker push ghcr.io/department-of-veterans-affairs/codeql-tools:collect-metrics

.PHONY: docker-run-collect-metrics
docker-run-collect-metrics:
	echo "Running docker image for configure-codeql"
	./scripts/docker-run-collect-metrics.sh

.PHONY: deps
deps:
	go get -u ./...
	go mod tidy
	go mod vendor
