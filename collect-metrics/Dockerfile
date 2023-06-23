FROM golang:1.20-bullseye as builder
WORKDIR /app
COPY . .
RUN go build -o /collect-metrics ./collect-metrics/cmd

FROM gcr.io/distroless/base-debian11
MAINTAINER "GitHub Expert Services"
LABEL org.opencontainers.image.source="https://github.com/department-of-veterans-affairs/codeql-tools"
LABEL org.opencontainers.image.description="GitHub Action for generating CodeQL enablement metrics"
COPY --from=builder /collect-metrics /
ENTRYPOINT ["/collect-metrics"]
