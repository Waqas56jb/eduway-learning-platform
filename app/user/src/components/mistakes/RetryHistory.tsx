import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Icon, type IconName } from "@/components/icons";
import { Card, Text } from "@/components/ui";
import { useI18n } from "@/hooks/useI18n";
import type { MistakeEntry } from "./grouping";
import { space, useTheme } from "@/theme";
import { formatDate } from "@/utils/format";

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

interface Node {
  key: string;
  icon: IconName;
  color: string;
  title: string;
  date: string;
}

/** Vertical timeline: original mistake + each retry (newest first). */
export const RetryHistory = memo(function RetryHistory({
  entry,
}: {
  entry: MistakeEntry;
}) {
  const { colors } = useTheme();
  const { t, lang } = useI18n("mistakes");

  // Only retries are listed as attempts; the original miss is the "origin" node.
  const retries = entry.history.filter((h) => h.source === "retry");
  const nodes: Node[] = [
    ...[...retries].reverse().map((h, i) => ({
      key: `h-${retries.length - i}`,
      icon: (h.correct ? "check-circle" : "x-circle") as IconName,
      color: h.correct ? colors.success : colors.danger,
      title: h.correct ? t("retry.attemptCorrect") : t("retry.attemptWrong"),
      date: h.date,
    })),
    {
      key: "origin",
      icon: "flag",
      color: colors.warning,
      title: t("retry.firstMissed", { source: t(`source.${entry.source}`) }),
      date: entry.firstMissedAt ?? entry.date,
    },
  ];

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Icon name="history" size={20} color={colors.accent} />
        <Text variant="h3" style={styles.flex}>
          {t("retry.historyTitle")}
        </Text>
        <Text variant="caption" color="muted">
          {t("retry.repeatCount", { count: entry.repeatCount })}
        </Text>
      </View>
      {retries.length === 0 ? (
        <Text variant="caption" color="muted">
          {t("retry.historyEmpty")}
        </Text>
      ) : null}
      <View>
        {nodes.map((n, i) => (
          <Animated.View
            key={n.key}
            entering={FadeInDown.duration(250).delay(i * 40)}
            style={styles.node}
          >
            <View style={styles.rail}>
              <Icon name={n.icon} size={20} color={n.color} />
              {i < nodes.length - 1 ? (
                <View
                  style={[styles.line, { backgroundColor: colors.border }]}
                />
              ) : null}
            </View>
            <View style={styles.nodeText}>
              <Text variant="label">{n.title}</Text>
              <Text variant="caption" color="muted">
                {formatDate(n.date, lang, DATE_OPTS)}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  node: { flexDirection: "row", gap: space.md },
  rail: { alignItems: "center", width: 20 },
  line: {
    width: 2,
    flex: 1,
    minHeight: 16,
    marginVertical: space.xxs,
    borderRadius: 1,
  },
  nodeText: { flex: 1, paddingBottom: space.md, gap: space.xxs },
});
