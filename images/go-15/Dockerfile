FROM golang:1.15 as base

RUN apt-get update && apt-get install -y \
    curl \
    git \
    jq \
    tar \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -ms /bin/bash codeql

ENV PATH="/usr/local/codeql:${PATH}"

FROM base as codeql

COPY install-codeql.sh /tmp/install-codeql.sh
RUN /tmp/install-codeql.sh && \
    rm /tmp/install-codeql.sh && \
    chmod -R a+rx /usr/local/codeql

FROM base as agent
LABEL org.opencontainers.image.source=https://github.com/department-of-veterans-affairs/codeql-tools
COPY --from=codeql /usr/local/codeql /usr/local/codeql
USER codeql
WORKDIR /home/codeql
