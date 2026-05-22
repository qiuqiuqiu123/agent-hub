import { execSync } from 'child_process'

/**
 * Git 分支生命周期管理
 * 每次 pipeline 执行创建一个临时分支，完成后可选合并回 baseBranch
 */

export interface BranchInfo {
  branch: string
  baseSha: string
}

export function createRunBranch(workDir: string, pipelineName: string, baseBranch: string): BranchInfo {
  const timestamp = Date.now()
  const safeName = pipelineName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()
  const branch = `pipeline/${safeName}-${timestamp}`

  // 确保在 baseBranch 上
  execSync(`git checkout ${baseBranch}`, { cwd: workDir, stdio: 'pipe' })

  // 记录基准 SHA
  const baseSha = execSync('git rev-parse HEAD', { cwd: workDir, stdio: 'pipe' }).toString().trim()

  // 创建并切换到新分支
  execSync(`git checkout -b ${branch}`, { cwd: workDir, stdio: 'pipe' })

  return { branch, baseSha }
}

export function collectCommits(workDir: string, baseSha: string): string[] {
  try {
    const output = execSync(`git rev-list ${baseSha}..HEAD --reverse`, { cwd: workDir, stdio: 'pipe' }).toString().trim()
    if (!output) return []
    return output.split('\n')
  } catch {
    return []
  }
}

export function mergeBack(workDir: string, targetBranch: string, runBranch: string): void {
  execSync(`git checkout ${targetBranch}`, { cwd: workDir, stdio: 'pipe' })
  execSync(`git merge ${runBranch} --no-ff -m "Merge pipeline run: ${runBranch}"`, { cwd: workDir, stdio: 'pipe' })
}

export function cleanupBranch(workDir: string, branch: string): void {
  try {
    execSync(`git branch -D ${branch}`, { cwd: workDir, stdio: 'pipe' })
  } catch {
    // 分支可能已被删除
  }
}

export function isGitRepo(workDir: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: workDir, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
