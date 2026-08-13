const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_device_status: '设备运行状态查询',
  query_device_status: '设备状态查询',
  query_alarm: '告警记录查询',
  lookup_fault_code: '故障码查询',
  query_trend: '运行趋势分析',
  query_telemetry_statistics: '遥测统计查询',
  query_telemetry_series: '遥测趋势查询',
  search_manual: '故障知识检索',
  diagnose_device: '设备故障诊断',
  generate_operation_report: '运行报告生成',
  skill_view: '技能信息查看',
  tool_search: '可用工具查询',
  tool_describe: '工具说明查询',
  search_files: '相关文件检索',
  list_files: '文件列表查询',
  read_file: '文件内容读取',
  write_file: '文件内容写入',
  edit_file: '文件内容修改',
};

export function getToolDisplayName(name?: string) {
  const normalizedName = (name || '').trim().replace(/[\s-]+/g, '_').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  return TOOL_DISPLAY_NAMES[normalizedName] || '数据查询工具';
}
