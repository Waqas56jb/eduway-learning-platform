import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { SubjectIcon } from "@/components/icons";
import { Text } from "@/components/ui";
import { useI18n } from "@/hooks/useI18n";
import { radius, space, subjectColors, useTheme } from "@/theme";
import type { MistakeSection } from "./grouping";

/** Subject → unit header for the mistakes SectionList. */
export const MistakeSectionHeader = memo(function MistakeSectionHeader({
  section,
}: {
  section: MistakeSection;
}) {
  const { colors } = useTheme();
  const { t, L } = useI18n("mistakes");
  const color = subjectColors[section.subjectId];
  return (
    <View
      style={[styles.row, { backgroundColor: colors.background }]}
      accessibilityRole="header"
    >
      <View style={[styles.icon, { backgroundColor: `${color}1F` }]}>
        <SubjectIcon subjectId={section.subjectId} size={18} color={color} />
      </View>
      <View style={styles.titles}>
        <Text variant="overline" color={color} numberOfLines={1}>
          {L(section.subjectName)}
        </Text>
        {section.unitTitle ? (
          <Text variant="label" numberOfLines={1}>
            {L(section.unitTitle)}
          </Text>
        ) : null}
      </View>
      <View style={[styles.count, { backgroundColor: colors.surfaceMuted }]}>
        <Text variant="caption" color="muted" tabular>
          {t("section.count", { count: section.data.length })}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  titles: { flex: 1, gap: space.xxs },
  count: {
    minWidth: 28,
    height: 24,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
