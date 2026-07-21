{{/* Expand the chart name. */}}
{{- define "litemcp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Create a stable release-qualified name. */}}
{{- define "litemcp.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "litemcp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "litemcp.labels" -}}
helm.sh/chart: {{ include "litemcp.chart" . }}
{{ include "litemcp.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: litemcp
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "litemcp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "litemcp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "litemcp.server.fullname" -}}
{{- printf "%s-server" (include "litemcp.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "litemcp.web.fullname" -}}
{{- printf "%s-web" (include "litemcp.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "litemcp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "litemcp.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- required "serviceAccount.name is required when serviceAccount.create=false" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "litemcp.configMapName" -}}
{{- if .Values.config.create -}}
{{- default (printf "%s-config" (include "litemcp.fullname" .)) .Values.config.name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- required "config.existingConfigMap is required when config.create=false" .Values.config.existingConfigMap -}}
{{- end -}}
{{- end -}}

{{- define "litemcp.mongodbSecretName" -}}
{{- if .Values.mongodb.uri -}}
{{- printf "%s-mongodb" (include "litemcp.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- required "mongodb.existingSecret is required when mongodb.uri is empty" .Values.mongodb.existingSecret -}}
{{- end -}}
{{- end -}}

{{- define "litemcp.authSecretName" -}}
{{- if .Values.auth.secret -}}
{{- printf "%s-auth" (include "litemcp.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- required "auth.existingSecret is required when auth.secret is empty" .Values.auth.existingSecret -}}
{{- end -}}
{{- end -}}

{{- define "litemcp.server.image" -}}
{{- if .Values.image.server.digest -}}
{{- printf "%s@%s" .Values.image.server.repository .Values.image.server.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.server.repository (default .Chart.AppVersion .Values.image.server.tag) -}}
{{- end -}}
{{- end -}}

{{- define "litemcp.web.image" -}}
{{- if .Values.image.web.digest -}}
{{- printf "%s@%s" .Values.image.web.repository .Values.image.web.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.web.repository (default .Chart.AppVersion .Values.image.web.tag) -}}
{{- end -}}
{{- end -}}
